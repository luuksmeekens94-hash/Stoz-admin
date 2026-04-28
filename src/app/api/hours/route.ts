import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  if (!isAdmin) {
    where.userId = session.user.id;
  } else if (userId) {
    where.userId = userId;
  }

  if (status) {
    where.status = status;
  }

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
    const body = await request.json();
    const rawEntries: HourEntryInput[] = Array.isArray(body.entries) ? body.entries : [body];

    if (rawEntries.length === 0) {
      return NextResponse.json({ error: "Geen registraties opgegeven" }, { status: 400 });
    }

    if (rawEntries.length > 250) {
      return NextResponse.json({ error: "Maximaal 250 registraties per keer" }, { status: 400 });
    }

    const isAdmin = session.user.role === "ADMIN";
    const targetUserIds = Array.from(
      new Set(
        rawEntries.map((entry) =>
          isAdmin && entry.onBehalfOf ? String(entry.onBehalfOf) : session.user.id
        )
      )
    );

    const users = await prisma.user.findMany({
      where: { id: { in: targetUserIds }, active: true },
      select: { id: true },
    });
    const validUserIds = new Set(users.map((user) => user.id));

    if (validUserIds.size !== targetUserIds.length) {
      return NextResponse.json({ error: "Een of meer gebruikers zijn niet gevonden" }, { status: 404 });
    }

    const entries = rawEntries.map((entry) => {
      const { date, hours, description, workPackageId, activityId, therapistId } = entry;
      const targetUserId = isAdmin && entry.onBehalfOf ? String(entry.onBehalfOf) : session.user.id;

      if (!date || !hours || !workPackageId || !activityId) {
        throw new Error("Datum, uren, werkpakket en activiteit zijn verplicht");
      }

      const parsedHours = parseFloat(String(hours));

      if (Number.isNaN(parsedHours) || parsedHours <= 0 || parsedHours > 24) {
        throw new Error("Uren moet tussen 0 en 24 zijn");
      }

      if (!validUserIds.has(targetUserId)) {
        throw new Error("Gebruiker niet gevonden");
      }

      return {
        date: new Date(date),
        hours: parsedHours,
        description: description || "Werkzaamheden",
        userId: targetUserId,
        workPackageId,
        activityId,
        therapistId: therapistId || null,
        status: "DRAFT" as const,
      };
    });

    if (entries.length === 1) {
      const entry = await prisma.hourEntry.create({
        data: entries[0],
        include: {
          user: { select: { id: true, name: true } },
          workPackage: true,
          activity: true,
          therapist: true,
        },
      });

      return NextResponse.json(entry, { status: 201 });
    }

    await prisma.hourEntry.createMany({ data: entries });

    return NextResponse.json({ ok: true, count: entries.length }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown";
    console.error("Create hour entry error:", msg);
    return NextResponse.json({ error: `Fout bij opslaan: ${msg}` }, { status: 500 });
  }
}
