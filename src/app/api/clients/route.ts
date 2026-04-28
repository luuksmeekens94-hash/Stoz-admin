import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const clients = await prisma.client.findMany({ orderBy: { startDate: "desc" } });
  return NextResponse.json(clients);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { clientCode, toolUsed, startDate, endDate, notes } = body;

    if (!clientCode || !toolUsed || !startDate) {
      return NextResponse.json({ error: "Verplichte velden ontbreken" }, { status: 400 });
    }

    const client = await prisma.client.create({
      data: {
        clientCode,
        toolUsed,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        notes,
      },
    });

    return NextResponse.json(client, { status: 201 });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Cliëntcode bestaat al" }, { status: 400 });
    }
    console.error("Client create error:", error);
    return NextResponse.json({ error: "Fout bij opslaan" }, { status: 500 });
  }
}
