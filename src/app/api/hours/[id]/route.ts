import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { buildApprovedHourCorrection, HourCorrectionError } from "@/lib/hour-corrections";
import { assertHourEntryCasUpdated, buildHourEntryCasWhere, HourEntryConcurrencyError } from "@/lib/hour-entry-concurrency";
import {
  HourInputError,
  parseHourInput,
  parseProjectDateInput,
  validateOrdinaryApprovedCorrectionDateKey,
  validateOrdinaryHistoricalDraftEdit,
  validateOrdinaryHistoricalDraftEditDateKey,
  validateOrdinaryHourCreationDate,
  validateOrdinaryHourCreationDateKey,
  validateUserTherapistPairing,
  validateHourEntryDraft,
} from "@/lib/hour-entry-validation";
import {
  assertNoOrdinaryEntryOverlapsHistoricalReconstruction,
  HISTORICAL_RECONSTRUCTION_CREATE_ACTION,
  validateHistoricalReconstructionTargetsForScopes,
} from "@/lib/historical-reconstruction-db";
import { databaseAmsterdamDateKey } from "@/lib/hour-entry-db";
import { HistoricalReconstructionIntegrityError } from "@/lib/historical-reconstruction-integrity";
import { assertNoDirectIdentifiers, PrivacyTextError } from "@/lib/privacy-text";

interface HourMutationBody {
  status?: string;
  correctionReason?: string;
  date?: string;
  hours?: string | number;
  description?: string;
  workPackageId?: string;
  activityId?: string;
  therapistId?: string | null;
}

async function validateExistingEntry(entry: {
  date: Date;
  hours: number;
  userId: string;
  therapistId: string | null;
  workPackageId: string;
  activityId: string;
}) {
  const [activity, user, therapist] = await Promise.all([
    prisma.activity.findUnique({
      where: { id: entry.activityId },
      select: { workPackageId: true },
    }),
    prisma.user.findFirst({
      where: { id: entry.userId, active: true },
      select: { role: true },
    }),
    entry.therapistId
      ? prisma.therapist.findFirst({
          where: { id: entry.therapistId, active: true },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  if (!activity) throw new HourInputError("Activiteit niet gevonden.");
  if (!user) throw new HourInputError("Gebruiker niet gevonden of niet actief.");
  if (entry.therapistId && !therapist) {
    throw new HourInputError("Therapeut niet gevonden of niet actief.");
  }
  validateUserTherapistPairing(user.role, entry.therapistId);
  validateHourEntryDraft({
    dateKey: entry.date.toISOString().slice(0, 10),
    now: new Date(),
    hours: entry.hours,
    workPackageId: entry.workPackageId,
    activityWorkPackageId: activity.workPackageId,
  });
}

function staleHourEntryResponse() {
  return NextResponse.json(
    { error: "De urenregistratie is gelijktijdig gewijzigd. Vernieuw de pagina en probeer opnieuw." },
    { status: 409 },
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const { id } = await params;
  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige JSON-aanvraag." }, { status: 400 });
  }
  if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
    return NextResponse.json({ error: "De aanvraag moet een object zijn." }, { status: 400 });
  }
  const rawBody = parsedBody as Record<string, unknown>;
  if (
    (rawBody.status !== undefined && typeof rawBody.status !== "string") ||
    (rawBody.correctionReason !== undefined && typeof rawBody.correctionReason !== "string") ||
    (rawBody.date !== undefined && typeof rawBody.date !== "string") ||
    (rawBody.hours !== undefined &&
      typeof rawBody.hours !== "string" &&
      typeof rawBody.hours !== "number") ||
    (rawBody.description !== undefined && typeof rawBody.description !== "string") ||
    (rawBody.workPackageId !== undefined && typeof rawBody.workPackageId !== "string") ||
    (rawBody.activityId !== undefined && typeof rawBody.activityId !== "string") ||
    (rawBody.therapistId !== undefined &&
      rawBody.therapistId !== null &&
      typeof rawBody.therapistId !== "string")
  ) {
    return NextResponse.json({ error: "De aanvraag bevat een veld met een ongeldig type." }, { status: 400 });
  }
  const body = rawBody as HourMutationBody;

  const isAdmin = session.user.role === "ADMIN";
  const entry = await prisma.hourEntry.findFirst({
    where: {
      id,
      ...(isAdmin ? {} : { userId: session.user.id }),
    },
    include: { user: { select: { role: true, active: true } } },
  });
  if (!entry) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });

  const isOwner = entry.userId === session.user.id;

  const reconstructionAudit = await prisma.auditEvent.findFirst({
    where: {
      entityType: "HourEntry",
      entityId: id,
      action: HISTORICAL_RECONSTRUCTION_CREATE_ACTION,
    },
    select: { id: true },
  });
  const isHistoricalReconstruction = Boolean(reconstructionAudit);
  if (isHistoricalReconstruction) {
    return NextResponse.json(
      { error: "Gebruik de afgeschermde reconstructieroute voor deze registratie." },
      { status: 409 },
    );
  }
  if (entry.sourceForecastEntryId) {
    return NextResponse.json(
      { error: "Gebruik de afgeschermde planningurenroute voor wijzigingen en statusovergangen." },
      { status: 409 },
    );
  }

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
      assertNoDirectIdentifiers(correction.after.description, "omschrijving");
      assertNoDirectIdentifiers(correction.reason, "correctiereden");

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
      if (!entry.user.active) throw new HourInputError("Gebruiker is niet actief.");
      validateUserTherapistPairing(entry.user.role, correction.after.therapistId);

      const updated = await prisma.$transaction(
        async (tx) => {
          const currentDateKey = entry.date.toISOString().slice(0, 10);
          const correctedDate = new Date(`${correction.after.date}T00:00:00.000Z`);
          const protectedCoordinatesChanged =
            currentDateKey !== correction.after.date ||
            entry.therapistId !== correction.after.therapistId ||
            entry.workPackageId !== correction.after.workPackageId ||
            entry.activityId !== correction.after.activityId;
          const beforeWriteDateKey = await databaseAmsterdamDateKey(tx);
          validateOrdinaryApprovedCorrectionDateKey(
            currentDateKey,
            correction.after.date,
            beforeWriteDateKey,
          );
          if (protectedCoordinatesChanged) {
            await assertNoOrdinaryEntryOverlapsHistoricalReconstruction(tx, [
              {
                userId: entry.userId,
                therapistId: correction.after.therapistId,
                workPackageId: correction.after.workPackageId,
                activityId: correction.after.activityId,
                date: correctedDate,
              },
            ]);
          }

          const mutation = await tx.hourEntry.updateMany({
            where: buildHourEntryCasWhere(entry),
            data: {
              date: correctedDate,
              hours: correction.after.hours,
              description: correction.after.description,
              workPackageId: correction.after.workPackageId,
              activityId: correction.after.activityId,
              therapistId: correction.after.therapistId,
            },
          });
          assertHourEntryCasUpdated(mutation.count);
          await validateHistoricalReconstructionTargetsForScopes(tx, [
            {
              userId: entry.userId,
              therapistId: entry.therapistId,
              workPackageId: entry.workPackageId,
              activityId: entry.activityId,
            },
            {
              userId: entry.userId,
              therapistId: correction.after.therapistId,
              workPackageId: correction.after.workPackageId,
              activityId: correction.after.activityId,
            },
          ]);
          const afterWriteDateKey = await databaseAmsterdamDateKey(tx);
          validateOrdinaryApprovedCorrectionDateKey(
            currentDateKey,
            correction.after.date,
            afterWriteDateKey,
          );

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

          return tx.hourEntry.findUniqueOrThrow({
            where: { id },
            include: { user: true, workPackage: true, activity: true, therapist: true },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      return NextResponse.json({ entry: updated, correction });
    } catch (error: unknown) {
      if (
        error instanceof HourEntryConcurrencyError ||
        error instanceof HistoricalReconstructionIntegrityError ||
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
      ) {
        return NextResponse.json(
          { error: "De correctie conflicteert met de actuele, auditbare urenstand." },
          { status: 409 },
        );
      }
      if (
        error instanceof HourInputError ||
        error instanceof HourCorrectionError ||
        error instanceof PrivacyTextError
      ) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      console.error("Approved hour correction error:", error);
      return NextResponse.json({ error: "Correctie mislukt." }, { status: 500 });
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
      const mutation = await prisma.hourEntry.updateMany({
        where: buildHourEntryCasWhere(entry),
        data: { status: "SUBMITTED" },
      });
      if (mutation.count !== 1) return staleHourEntryResponse();
      const updated = await prisma.hourEntry.findUniqueOrThrow({ where: { id } });
      return NextResponse.json(updated);
    }

    if (body.status === "APPROVED" && isAdmin && entry.status === "SUBMITTED") {
      try {
        await validateExistingEntry(entry);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Goedkeuren geblokkeerd";
        return NextResponse.json({ error: message }, { status: 409 });
      }
      const mutation = await prisma.hourEntry.updateMany({
        where: buildHourEntryCasWhere(entry),
        data: {
          status: "APPROVED",
          approvedAt: new Date(),
          approvedBy: session.user.id,
        },
      });
      if (mutation.count !== 1) return staleHourEntryResponse();
      const updated = await prisma.hourEntry.findUniqueOrThrow({ where: { id } });
      return NextResponse.json(updated);
    }

    if (body.status === "DRAFT" && isAdmin && entry.status === "SUBMITTED") {
      const mutation = await prisma.hourEntry.updateMany({
        where: buildHourEntryCasWhere(entry),
        data: { status: "DRAFT" },
      });
      if (mutation.count !== 1) return staleHourEntryResponse();
      const updated = await prisma.hourEntry.findUniqueOrThrow({ where: { id } });
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Ongeldige statuswijziging" }, { status: 403 });
  }

  // Edit fields (drafts only, by owner or admin)
  if (entry.status !== "DRAFT") {
    return NextResponse.json({ error: "Kan alleen concepten bewerken" }, { status: 403 });
  }

  try {
    const mutableFields = ["date", "hours", "description", "workPackageId", "activityId", "therapistId"];
    if (!mutableFields.some((field) => Object.prototype.hasOwnProperty.call(body, field))) {
      return NextResponse.json({ error: "Geen wijzigbare velden ontvangen" }, { status: 400 });
    }

    const now = new Date();
    validateOrdinaryHistoricalDraftEdit(entry.date.toISOString().slice(0, 10), now);
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
    assertNoDirectIdentifiers(description, "omschrijving");
    const activity = await prisma.activity.findUnique({
      where: { id: activityId },
      select: { workPackageId: true },
    });
    if (!activity) throw new HourInputError("Activiteit niet gevonden.");
    validateHourEntryDraft({
      dateKey: parsedDate.dateKey,
      now,
      hours,
      workPackageId,
      activityWorkPackageId: activity.workPackageId,
    });
    validateOrdinaryHourCreationDate(parsedDate.dateKey, now);
    if (therapistId) {
      const therapist = await prisma.therapist.findFirst({
        where: { id: therapistId, active: true },
        select: { id: true },
      });
      if (!therapist) throw new HourInputError("Therapeut niet gevonden of niet actief.");
    }
    if (!entry.user.active) throw new HourInputError("Gebruiker is niet actief.");
    validateUserTherapistPairing(entry.user.role, therapistId);

    const updated = await prisma.$transaction(
      async (tx) => {
        await assertNoOrdinaryEntryOverlapsHistoricalReconstruction(tx, [
          {
            userId: entry.userId,
            therapistId,
            workPackageId,
            activityId,
            date: parsedDate.date,
          },
        ]);
        const beforeWriteDateKey = await databaseAmsterdamDateKey(tx);
        validateOrdinaryHistoricalDraftEditDateKey(
          entry.date.toISOString().slice(0, 10),
          beforeWriteDateKey,
        );
        validateOrdinaryHourCreationDateKey(parsedDate.dateKey, beforeWriteDateKey);

        const mutation = await tx.hourEntry.updateMany({
          where: buildHourEntryCasWhere(entry),
          data: {
            date: parsedDate.date,
            hours,
            description,
            workPackageId,
            activityId,
            therapistId,
          },
        });
        assertHourEntryCasUpdated(mutation.count);
        await validateHistoricalReconstructionTargetsForScopes(tx, [
          {
            userId: entry.userId,
            therapistId: entry.therapistId,
            workPackageId: entry.workPackageId,
            activityId: entry.activityId,
          },
          {
            userId: entry.userId,
            therapistId,
            workPackageId,
            activityId,
          },
        ]);
        const afterWriteDateKey = await databaseAmsterdamDateKey(tx);
        validateOrdinaryHistoricalDraftEditDateKey(
          entry.date.toISOString().slice(0, 10),
          afterWriteDateKey,
        );
        validateOrdinaryHourCreationDateKey(parsedDate.dateKey, afterWriteDateKey);
        return tx.hourEntry.findUniqueOrThrow({
          where: { id },
          include: { user: true, workPackage: true, activity: true, therapist: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return NextResponse.json(updated);
  } catch (error: unknown) {
    if (
      error instanceof HourEntryConcurrencyError ||
      error instanceof HistoricalReconstructionIntegrityError ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
    ) {
      return NextResponse.json(
        { error: "De wijziging conflicteert met de actuele, auditbare urenstand." },
        { status: 409 },
      );
    }
    if (error instanceof HourInputError || error instanceof PrivacyTextError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Draft hour edit error:", error);
    return NextResponse.json({ error: "Wijzigen mislukt." }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  void request;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const { id } = await params;
  const isAdmin = session.user.role === "ADMIN";
  const entry = await prisma.hourEntry.findFirst({
    where: {
      id,
      ...(isAdmin ? {} : { userId: session.user.id }),
    },
  });
  if (!entry) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });

  const reconstructionAudit = await prisma.auditEvent.findFirst({
    where: {
      entityType: "HourEntry",
      entityId: id,
      action: HISTORICAL_RECONSTRUCTION_CREATE_ACTION,
    },
    select: { id: true },
  });
  if (reconstructionAudit) {
    return NextResponse.json(
      { error: "Gebruik de afgeschermde reconstructieroute voor deze registratie." },
      { status: 409 },
    );
  }
  if (entry.sourceForecastEntryId) {
    return NextResponse.json(
      { error: "Een concept uit goedgekeurde planning kan worden gecorrigeerd, maar niet verwijderd." },
      { status: 409 },
    );
  }
  if (entry.status !== "DRAFT") {
    return NextResponse.json({ error: "Alleen concepten kunnen verwijderd worden" }, { status: 403 });
  }

  const deletion = await prisma.hourEntry.deleteMany({
    where: buildHourEntryCasWhere(entry),
  });
  if (deletion.count !== 1) return staleHourEntryResponse();
  return NextResponse.json({ ok: true });
}
