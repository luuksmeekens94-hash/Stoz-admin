import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const body = await request.json();
  const { ids, action } = body;

  if (!ids?.length || !action) {
    return NextResponse.json({ error: "IDs en actie zijn verplicht" }, { status: 400 });
  }

  const isAdmin = session.user.role === "ADMIN";

  if (action === "submit") {
    // Owner submits own drafts, admin can submit any drafts
    await prisma.hourEntry.updateMany({
      where: {
        id: { in: ids },
        ...(isAdmin ? {} : { userId: session.user.id }),
        status: "DRAFT",
      },
      data: { status: "SUBMITTED" },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "approve" && isAdmin) {
    await prisma.hourEntry.updateMany({
      where: {
        id: { in: ids },
        status: "SUBMITTED",
      },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        approvedBy: session.user.id,
      },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Ongeldige actie" }, { status: 403 });
}
