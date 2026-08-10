import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { validateHourEntryDraft } from "@/lib/hour-entry-validation";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  assertHourEntryCasUpdated,
  buildHourEntryBulkCasWhere,
  HourEntryConcurrencyError,
} from "@/lib/hour-entry-concurrency";

function bulkMutationErrorResponse(error: unknown) {
  const isTransactionConflict =
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
  const status = error instanceof HourEntryConcurrencyError || isTransactionConflict ? 409 : 400;
  const message = error instanceof Error ? error.message : "Bulkmutatie mislukt";
  return NextResponse.json({ error: message }, { status });
}

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const body = await request.json();
  const action = body?.action;
  const rawIds: unknown[] = Array.isArray(body?.ids) ? body.ids : [];
  const ids: string[] = Array.from(
    new Set(rawIds.map((id) => String(id).trim()).filter((id): id is string => Boolean(id))),
  );
  if (ids.length === 0 || ids.length > 200 || !action) {
    return NextResponse.json({ error: "Geef 1 tot 200 unieke IDs en een actie op" }, { status: 400 });
  }

  const isAdmin = session.user.role === "ADMIN";
  const now = new Date();

  if (action === "submit") {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const entries = await tx.hourEntry.findMany({
            where: {
              id: { in: ids },
              ...(isAdmin ? {} : { userId: session.user.id }),
              status: "DRAFT",
            },
            include: { activity: { select: { workPackageId: true } } },
          });
          if (entries.length !== ids.length) {
            throw new Error("Niet alle geselecteerde concepten zijn indienbaar.");
          }
          for (const entry of entries) {
            validateHourEntryDraft({
              dateKey: entry.date.toISOString().slice(0, 10),
              now,
              hours: entry.hours,
              workPackageId: entry.workPackageId,
              activityWorkPackageId: entry.activity.workPackageId,
            });
          }
          const mutation = await tx.hourEntry.updateMany({
            where: buildHourEntryBulkCasWhere(entries),
            data: { status: "SUBMITTED" },
          });
          assertHourEntryCasUpdated(mutation.count, entries.length);
          return mutation;
        },
        { isolationLevel: "Serializable" },
      );
      return NextResponse.json({ ok: true, count: result.count });
    } catch (error) {
      return bulkMutationErrorResponse(error);
    }
  }

  if (action === "approve" && isAdmin) {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const entries = await tx.hourEntry.findMany({
            where: { id: { in: ids }, status: "SUBMITTED" },
            include: { activity: { select: { workPackageId: true } } },
          });
          if (entries.length !== ids.length) {
            throw new Error("Niet alle geselecteerde regels zijn goed te keuren.");
          }
          for (const entry of entries) {
            validateHourEntryDraft({
              dateKey: entry.date.toISOString().slice(0, 10),
              now,
              hours: entry.hours,
              workPackageId: entry.workPackageId,
              activityWorkPackageId: entry.activity.workPackageId,
            });
          }
          const mutation = await tx.hourEntry.updateMany({
            where: buildHourEntryBulkCasWhere(entries),
            data: { status: "APPROVED", approvedAt: now, approvedBy: session.user.id },
          });
          assertHourEntryCasUpdated(mutation.count, entries.length);
          return mutation;
        },
        { isolationLevel: "Serializable" },
      );
      return NextResponse.json({ ok: true, count: result.count });
    } catch (error) {
      return bulkMutationErrorResponse(error);
    }
  }

  return NextResponse.json({ error: "Ongeldige actie" }, { status: 403 });
}
