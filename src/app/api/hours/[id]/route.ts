import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  // Status transitions
  if (body.status) {
    if (body.status === "SUBMITTED" && (isOwner || isAdmin) && entry.status === "DRAFT") {
      const updated = await prisma.hourEntry.update({
        where: { id },
        data: { status: "SUBMITTED" },
      });
      return NextResponse.json(updated);
    }

    if (body.status === "APPROVED" && isAdmin && entry.status === "SUBMITTED") {
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

  const updateData: Record<string, unknown> = {};
  if (body.date) updateData.date = new Date(body.date);
  if (body.hours) updateData.hours = parseFloat(body.hours);
  if (body.description) updateData.description = body.description;
  if (body.workPackageId) updateData.workPackageId = body.workPackageId;
  if (body.activityId) updateData.activityId = body.activityId;

  const updated = await prisma.hourEntry.update({
    where: { id },
    data: updateData,
    include: { user: true, workPackage: true, activity: true },
  });

  return NextResponse.json(updated);
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
