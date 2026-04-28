import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const therapists = await prisma.therapist.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(therapists);
}

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { id, hourlyRate } = body;

    if (!id) {
      return NextResponse.json({ error: "ID is verplicht" }, { status: 400 });
    }

    const therapist = await prisma.therapist.update({
      where: { id },
      data: { hourlyRate: hourlyRate !== null && hourlyRate !== "" ? parseFloat(hourlyRate) : null },
    });

    return NextResponse.json(therapist);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
