import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const trainings = await prisma.training.findMany({
    orderBy: { date: "desc" },
    include: { attendees: true },
  });

  return NextResponse.json(trainings);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { name, date, hours, topic, notes, attendees } = body;

    if (!name || !date || !hours || !topic) {
      return NextResponse.json({ error: "Verplichte velden ontbreken" }, { status: 400 });
    }

    const training = await prisma.training.create({
      data: {
        name,
        date: new Date(date),
        hours: parseFloat(hours),
        topic,
        notes,
        attendees: {
          create: (attendees || []).map((a: { name: string; present: boolean }) => ({
            name: a.name,
            present: a.present || false,
          })),
        },
      },
      include: { attendees: true },
    });

    return NextResponse.json(training, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown";
    console.error("Training create error:", msg);
    return NextResponse.json({ error: `Fout bij opslaan: ${msg}` }, { status: 500 });
  }
}
