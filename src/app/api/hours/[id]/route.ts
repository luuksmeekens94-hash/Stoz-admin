import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { buildApprovedHourCorrection } from "@/lib/hour-corrections";
import {
  HourInputError,
  parseHourInput,
  parseProjectDateInput,
  validateHourEntryDraft,
} from "@/lib/hour-entry-validation";

async function validateExistingEntry(entry: {
  date: Date;
  hours: number;
  workPackageId: string;
  activityId: string;
}) {
  const activity = await prisma.activity.findUnique({
    where: { id: entry.activityId },
    select: { workPackageId: true },
  });
  if (!activity) throw new HourInputError("Activiteit niet gevonden.");
  validateHourEntryDraft({
    dateKey: entry.date.toISOString().slice(0, 10),
    now: new Date(),
    hours: entry.hours,
    workPackageId: entry.workPackageId,
    activityWorkPackageId: activity.workPackageId,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const entry = await prisma.hourEntry.findUnique({ where: { id } });
  if (!entry) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });

  const isAdmin = session.user.role === "ADMIN";
  const isOwner = entry.userId === session.user.id;


  // Approved rows are corrected, never silently overwritten or deleted.
  if (entry.status === "APPROVED" && body.correctionReason) {
    if (!isAdmin) {
      return NextResponse.json({ error: "Alleen een beheerder mag goedgekeurde uren corrigeren" }, { status: 403 });
    }

    try {
      const correction = buildApprovedHourCorrection(entry, {
        date: body.date,
        hours: body.hours,
        description: body.description,
        workPackageId: body.workPackageId,
        activityId: body.activityId,
        therapistId: body.therapistId,
        correctionReason: body.correctionReason,
      });

      const targetActivity = await prisma.activity.findUnique({
        where: { id: correction.after.activityId },
        select: { workPackageId: true },
      });
      if (!targetActivity || targetActivity.workPackageId !== correction.after.workPackageId) {
        return NextResponse.json(
          { error: "De activiteit hoort niet bij het gekozen werkpakket" },
          { status: 400 }
        );
      }

      validateHourEntryDraft({
        dateKey: correction.after.date,
        now: new Date(),
        hours: correction.after.hours,
        workPackageId: correction.after.workPackageId,
        activityWorkPackageId: targetActivity.workPackageId,
      });
      if (correction.after.therapistId) {
        const therapist = await prisma.therapist.findFirst({
          where: { id: correction.after.therapistId, active: true },
          select: { id: true },
        });
        if (!therapist) throw new HourInputError("Therapeut niet gevonden of niet actief.");
      }

      const updated = await prisma.$transaction(async (tx) => {
        await tx.auditEvent.create({
          data: {
            entityType: "HourEntry",
            entityId: entry.id,
            action: "APPROVED_CORRECTION",
            reason: correction.reason,
            beforeData: correction.before as unknown as Prisma.InputJsonValue,
            afterData: correction.after as unknown as Prisma.InputJsonValue,
            actorUserId: session.user.id,
          },
        });

        return tx.hourEntry.update({
          where: { id },
          data: {
            date: new Date(`${correction.after.date}T00:00:00.000Z`),
            hours: correction.after.hours,
            description: correction.after.description,
            workPackageId: correction.after.workPackageId,
            activityId: correction.after.activityId,
            therapistId: correction.after.therapistId,
          },
          include: { user: true, workPackage: true, activity: true, therapist: true },
        });
      });

      return NextResponse.json({ entry: updated, correction });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Correctie mislukt";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  // Status transitions
  if (body.status) {
    if (body.status === "SUBMITTED" && (isOwner || isAdmin) && entry.status === "DRAFT") {
      try {
        await validateExistingEntry(entry);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Indienen geblokkeerd";
        return NextResponse.json({ error: message }, { status: 409 });
      }
      const updated = await prisma.hourEntry.update({
        where: { id },
        data: { status: "SUBMITTED" },
      });
      return NextResponse.json(updated);
    }

    if (body.status === "APPROVED" && isAdmin && entry.status === "SUBMITTED") {
      try {
        await validateExistingEntry(entry);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Goedkeuren geblokkeerd";
        return NextResponse.json({ error: message }, { status: 409 });
      }
      const updated = await prisma.hourEntry.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvedAt: new Date(),
          approvedBy: session.user.id,
        },
      });
      return NextResponse.json(updated);
    }

    if (body.status === "DRAFT" && isAdmin && entry.status === "SUBMITTED") {
      const updated = await prisma.hourEntry.update({
        where: { id },
        data: { status: "DRAFT" },
      });
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Ongeldige statuswijziging" }, { status: 403 });
  }

  // Edit fields (drafts only, by owner or admin)
  if ((!isOwner && !isAdmin) || entry.status !== "DRAFT") {
    return NextResponse.json({ error: "Kan alleen concepten bewerken" }, { status: 403 });
  }

  try {
    const mutableFields = ["date", "hours", "description", "workPackageId", "activityId", "therapistId"];
    if (!mutableFields.some((field) => Object.prototype.hasOwnProperty.call(body, field))) {
      return NextResponse.json({ error: "Geen wijzigbare velden ontvangen" }, { status: 400 });
    }

    const parsedDate = body.date !== undefined
      ? parseProjectDateInput(body.date)
      : { date: entry.date, dateKey: entry.date.toISOString().slice(0, 10) };
    const hours = body.hours !== undefined ? parseHourInput(body.hours) : entry.hours;
    const workPackageId = body.workPackageId !== undefined ? String(body.workPackageId) : entry.workPackageId;
    const activityId = body.activityId !== undefined ? String(body.activityId) : entry.activityId;
    const description = body.description !== undefined ? String(body.description).trim() : entry.description;
    const therapistId = body.therapistId !== undefined
      ? String(body.therapistId || "").trim() || null
      : entry.therapistId;

    if (description.length < 5) {
      throw new HourInputError("Geef een herleidbare omschrijving van de werkzaamheden.");
    }
    const activity = await prisma.activity.findUnique({
      where: { id: activityId },
      select: { workPackageId: true },
    });
    if (!activity) throw new HourInputError("Activiteit niet gevonden.");
    validateHourEntryDraft({
      dateKey: parsedDate.dateKey,
      now: new Date(),
      hours,
      workPackageId,
      activityWorkPackageId: activity.workPackageId,
    });
    if (therapistId) {
      const therapist = await prisma.therapist.findFirst({
        where: { id: therapistId, active: true },
        select: { id: true },
      });
      if (!therapist) throw new HourInputError("Therapeut niet gevonden of niet actief.");
    }

    const updated = await prisma.hourEntry.update({
      where: { id },
      data: {
        date: parsedDate.date,
        hours,
        description,
        workPackageId,
        activityId,
        therapistId,
      },
      include: { user: true, workPackage: true, activity: true, therapist: true },
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Wijzigen mislukt";
    return NextResponse.json({ error: message }, { status: error instanceof HourInputError ? 400 : 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const { id } = await params;
  const entry = await prisma.hourEntry.findUnique({ where: { id } });
  if (!entry) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });

  // Only drafts can be deleted, by owner or admin
  if (entry.status !== "DRAFT") {
    return NextResponse.json({ error: "Alleen concepten kunnen verwijderd worden" }, { status: 403 });
  }

  const isOwner = entry.userId === session.user.id;
  const isAdmin = session.user.role === "ADMIN";

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  await prisma.hourEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
