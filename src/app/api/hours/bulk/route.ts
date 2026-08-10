import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { validateHourEntryDraft } from "@/lib/hour-entry-validation";
import { prisma } from "@/lib/prisma";

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
    const result = await prisma.$transaction(async (tx) => {
      const entries = await tx.hourEntry.findMany({
        where: {
          id: { in: ids },
          ...(isAdmin ? {} : { userId: session.user.id }),
          status: "DRAFT",
        },
        include: { activity: { select: { workPackageId: true } } },
      });
      if (entries.length !== ids.length) throw new Error("Niet alle geselecteerde concepten zijn indienbaar.");
      for (const entry of entries) {
        validateHourEntryDraft({
          dateKey: entry.date.toISOString().slice(0, 10),
          now,
          hours: entry.hours,
          workPackageId: entry.workPackageId,
          activityWorkPackageId: entry.activity.workPackageId,
        });
      }
      return tx.hourEntry.updateMany({
        where: { id: { in: ids }, status: "DRAFT" },
        data: { status: "SUBMITTED" },
      });
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ ok: true, count: result.count });
  }

  if (action === "approve" && isAdmin) {
    const result = await prisma.$transaction(async (tx) => {
      const entries = await tx.hourEntry.findMany({
        where: { id: { in: ids }, status: "SUBMITTED" },
        include: { activity: { select: { workPackageId: true } } },
      });
      if (entries.length !== ids.length) throw new Error("Niet alle geselecteerde regels zijn goed te keuren.");
      for (const entry of entries) {
        validateHourEntryDraft({
          dateKey: entry.date.toISOString().slice(0, 10),
          now,
          hours: entry.hours,
          workPackageId: entry.workPackageId,
          activityWorkPackageId: entry.activity.workPackageId,
        });
      }
      return tx.hourEntry.updateMany({
        where: { id: { in: ids }, status: "SUBMITTED" },
        data: { status: "APPROVED", approvedAt: now, approvedBy: session.user.id },
      });
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ ok: true, count: result.count });
  }

  return NextResponse.json({ error: "Ongeldige actie" }, { status: 403 });
}
