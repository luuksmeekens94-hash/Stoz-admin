import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { id } = await params;
  const training = await prisma.training.findUnique({
    where: { id },
    include: { attendees: true },
  });

  if (!training) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  return NextResponse.json(training);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();

  // Update attendee presence
  if (body.attendees) {
    for (const att of body.attendees) {
      if (att.id) {
        await prisma.trainingAttendee.update({
          where: { id: att.id },
          data: { present: att.present },
        });
      }
    }
  }

  const training = await prisma.training.findUnique({
    where: { id },
    include: { attendees: true },
  });

  return NextResponse.json(training);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { id } = await params;
  await prisma.training.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
