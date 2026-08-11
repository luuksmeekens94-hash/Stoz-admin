import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  HourInputError,
  parseHourInput,
  parseProjectDateInput,
  validateHourEntryDraft,
  validateOrdinaryHourCreationDate,
  validateOrdinaryHourCreationDateKey,
  validateUserTherapistPairing,
} from "@/lib/hour-entry-validation";
import { databaseAmsterdamDateKey } from "@/lib/hour-entry-db";
import { assertNoDirectIdentifiers, PrivacyTextError } from "@/lib/privacy-text";
import { assertNoOrdinaryEntryOverlapsHistoricalReconstruction } from "@/lib/historical-reconstruction-db";
import { HistoricalReconstructionIntegrityError } from "@/lib/historical-reconstruction-integrity";

interface HourEntryInput {
  date?: string;
  hours?: string | number;
  description?: string;
  workPackageId?: string;
  activityId?: string;
  onBehalfOf?: string;
  therapistId?: string | null;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const userId = searchParams.get("userId");
  const isAdmin = session.user.role === "ADMIN";
  const where: Record<string, unknown> = {};

  if (!isAdmin) where.userId = session.user.id;
  else if (userId) where.userId = userId;
  if (status) where.status = status;

  const entries = await prisma.hourEntry.findMany({
    where,
    orderBy: { date: "desc" },
    include: {
      user: { select: { id: true, name: true, email: true } },
      workPackage: true,
      activity: true,
      therapist: true,
    },
  });
  return NextResponse.json(entries);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  try {
    const parsedBody: unknown = await request.json();
    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
      throw new HourInputError("De aanvraag moet een object zijn.");
    }
    const body = parsedBody as Record<string, unknown>;
    const rawValues = Array.isArray(body.entries) ? body.entries : [body];
    const rawEntries: HourEntryInput[] = rawValues.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new HourInputError("Iedere urenregistratie moet een object zijn.");
      }
      return value as HourEntryInput;
    });
    if (rawEntries.length === 0) {
      return NextResponse.json({ error: "Geen registraties opgegeven" }, { status: 400 });
    }
    if (rawEntries.length > 250) {
      return NextResponse.json({ error: "Maximaal 250 registraties per keer" }, { status: 400 });
    }
    for (const entry of rawEntries) {
      if (
        (entry.date !== undefined && typeof entry.date !== "string") ||
        (entry.hours !== undefined &&
          typeof entry.hours !== "string" &&
          typeof entry.hours !== "number") ||
        (entry.workPackageId !== undefined && typeof entry.workPackageId !== "string") ||
        (entry.activityId !== undefined && typeof entry.activityId !== "string") ||
        (entry.description !== undefined && typeof entry.description !== "string") ||
        (entry.therapistId !== undefined &&
          entry.therapistId !== null &&
          typeof entry.therapistId !== "string") ||
        (entry.onBehalfOf !== undefined && typeof entry.onBehalfOf !== "string")
      ) {
        throw new HourInputError("De urenregistratie bevat een veld met een ongeldig type.");
      }
    }

    const isAdmin = session.user.role === "ADMIN";
    const targetUserIds = Array.from(
      new Set(
        rawEntries.map((entry) =>
          isAdmin && entry.onBehalfOf ? String(entry.onBehalfOf) : session.user.id,
        ),
      ),
    );
    const activityIds = Array.from(
      new Set(rawEntries.map((entry) => String(entry.activityId || ""))),
    );
    const therapistIds = Array.from(
      new Set(
        rawEntries
          .map((entry) => entry.therapistId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const [users, activities, activeTherapists] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: targetUserIds }, active: true },
        select: { id: true, role: true },
      }),
      prisma.activity.findMany({
        where: { id: { in: activityIds } },
        select: { id: true, workPackageId: true },
      }),
      therapistIds.length
        ? prisma.therapist.findMany({
            where: { id: { in: therapistIds }, active: true },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);
    const validUserIds = new Set(users.map((user) => user.id));
    const userRoleById = new Map(users.map((user) => [user.id, user.role]));
    const activityById = new Map(activities.map((activity) => [activity.id, activity]));
    const validTherapistIds = new Set(activeTherapists.map((therapist) => therapist.id));

    if (validUserIds.size !== targetUserIds.length) {
      return NextResponse.json({ error: "Een of meer gebruikers zijn niet gevonden" }, { status: 404 });
    }
    if (activityById.size !== activityIds.length) {
      return NextResponse.json({ error: "Een of meer activiteiten zijn niet gevonden" }, { status: 404 });
    }
    if (validTherapistIds.size !== therapistIds.length) {
      return NextResponse.json({ error: "Een of meer therapeuten zijn niet gevonden" }, { status: 404 });
    }

    const now = new Date();
    const entries = rawEntries.map((entry) => {
      const { date, hours, description, workPackageId, activityId, therapistId } = entry;
      const targetUserId =
        isAdmin && entry.onBehalfOf ? String(entry.onBehalfOf) : session.user.id;
      if (!date || !hours || !workPackageId || !activityId) {
        throw new HourInputError("Datum, uren, werkpakket en activiteit zijn verplicht");
      }
      const parsedHours = parseHourInput(hours);
      const { date: parsedDate, dateKey } = parseProjectDateInput(date);
      const activity = activityById.get(activityId);
      if (!activity) throw new HourInputError("Activiteit niet gevonden");
      validateHourEntryDraft({
        dateKey,
        now,
        hours: parsedHours,
        workPackageId,
        activityWorkPackageId: activity.workPackageId,
      });
      validateOrdinaryHourCreationDate(dateKey, now);
      if (!validUserIds.has(targetUserId)) {
        throw new HourInputError("Gebruiker niet gevonden");
      }
      const targetUserRole = userRoleById.get(targetUserId);
      if (!targetUserRole) throw new HourInputError("Gebruiker niet gevonden");
      validateUserTherapistPairing(targetUserRole, therapistId || null);

      const normalizedDescription = String(description || "Werkzaamheden").trim();
      assertNoDirectIdentifiers(normalizedDescription, "omschrijving");
      return {
        date: parsedDate,
        hours: parsedHours,
        description: normalizedDescription,
        userId: targetUserId,
        workPackageId,
        activityId,
        therapistId: therapistId || null,
        status: "DRAFT" as const,
      };
    });

    const result = await prisma.$transaction(
      async (tx) => {
        await assertNoOrdinaryEntryOverlapsHistoricalReconstruction(tx, entries);
        const beforeWriteDateKey = await databaseAmsterdamDateKey(tx);
        for (const entry of entries) {
          validateOrdinaryHourCreationDateKey(
            entry.date.toISOString().slice(0, 10),
            beforeWriteDateKey,
          );
        }
        if (entries.length === 1) {
          const created = await tx.hourEntry.create({
            data: entries[0],
            include: {
              user: { select: { id: true, name: true } },
              workPackage: true,
              activity: true,
              therapist: true,
            },
          });
          validateOrdinaryHourCreationDateKey(
            created.date.toISOString().slice(0, 10),
            await databaseAmsterdamDateKey(tx),
          );
          return created;
        }
        await tx.hourEntry.createMany({ data: entries });
        const afterWriteDateKey = await databaseAmsterdamDateKey(tx);
        for (const entry of entries) {
          validateOrdinaryHourCreationDateKey(
            entry.date.toISOString().slice(0, 10),
            afterWriteDateKey,
          );
        }
        return null;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return NextResponse.json(result ?? { ok: true, count: entries.length }, { status: 201 });
  } catch (error: unknown) {
    if (
      error instanceof HourInputError ||
      error instanceof PrivacyTextError ||
      error instanceof HistoricalReconstructionIntegrityError
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error instanceof HistoricalReconstructionIntegrityError ? 409 : 400 },
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json(
        { error: "De urenstand is gelijktijdig gewijzigd. Vernieuw de pagina." },
        { status: 409 },
      );
    }
    console.error("Create hour entry error:", error);
    return NextResponse.json({ error: "Uren opslaan mislukt." }, { status: 500 });
  }
}
