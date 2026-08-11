import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  HourInputError,
  validateHourEntryDraft,
  validateUserTherapistPairing,
} from "@/lib/hour-entry-validation";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  assertHourEntryCasUpdated,
  buildHourEntryBulkCasWhere,
  HourEntryConcurrencyError,
} from "@/lib/hour-entry-concurrency";
import { HISTORICAL_RECONSTRUCTION_CREATE_ACTION } from "@/lib/historical-reconstruction-db";

function bulkMutationErrorResponse(error: unknown) {
  const isTransactionConflict =
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
  if (error instanceof HourEntryConcurrencyError || isTransactionConflict) {
    return NextResponse.json(
      { error: "De urenstand is gelijktijdig gewijzigd. Vernieuw de pagina." },
      { status: 409 },
    );
  }
  if (error instanceof HourInputError || (error instanceof Error && /^Niet alle /.test(error.message))) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error("Bulk hour mutation error:", error);
  return NextResponse.json({ error: "Bulkmutatie mislukt." }, { status: 500 });
}

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    const parsedBody: unknown = await request.json();
    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
      throw new Error("invalid-body");
    }
    body = parsedBody as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Ongeldige JSON-aanvraag." }, { status: 400 });
  }
  const action = body.action;
  const rawIds: unknown[] = Array.isArray(body.ids) ? body.ids : [];
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
            include: {
              activity: { select: { workPackageId: true } },
              user: { select: { role: true, active: true } },
              therapist: { select: { active: true } },
            },
          });
          if (entries.length !== ids.length) {
            throw new Error("Niet alle geselecteerde concepten zijn indienbaar.");
          }
          const reconstructionAudits = await tx.auditEvent.findMany({
            where: {
              entityType: "HourEntry",
              entityId: { in: ids },
              action: HISTORICAL_RECONSTRUCTION_CREATE_ACTION,
            },
            select: { entityId: true },
          });
          const reconstructionIds = new Set(reconstructionAudits.map((audit) => audit.entityId));
          if (reconstructionIds.size > 0) {
            throw new HourInputError(
              "Historische reconstructies moeten afzonderlijk worden beoordeeld en ingediend.",
            );
          }
          for (const entry of entries) {
            if (!entry.user.active) {
              throw new HourInputError("Gebruiker niet gevonden of niet actief.");
            }
            if (entry.therapistId && !entry.therapist?.active) {
              throw new HourInputError("Therapeut niet gevonden of niet actief.");
            }
            validateUserTherapistPairing(entry.user.role, entry.therapistId);
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
            include: {
              activity: { select: { workPackageId: true } },
              user: { select: { role: true, active: true } },
              therapist: { select: { active: true } },
            },
          });
          if (entries.length !== ids.length) {
            throw new Error("Niet alle geselecteerde regels zijn goed te keuren.");
          }
          const reconstructionAudits = await tx.auditEvent.findMany({
            where: {
              entityType: "HourEntry",
              entityId: { in: ids },
              action: HISTORICAL_RECONSTRUCTION_CREATE_ACTION,
            },
            select: { entityId: true },
          });
          const reconstructionIds = new Set(reconstructionAudits.map((audit) => audit.entityId));
          if (reconstructionIds.size > 0) {
            throw new HourInputError(
              "Historische reconstructies moeten afzonderlijk worden beoordeeld en goedgekeurd.",
            );
          }
          for (const entry of entries) {
            if (!entry.user.active) {
              throw new HourInputError("Gebruiker niet gevonden of niet actief.");
            }
            if (entry.therapistId && !entry.therapist?.active) {
              throw new HourInputError("Therapeut niet gevonden of niet actief.");
            }
            validateUserTherapistPairing(entry.user.role, entry.therapistId);
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
