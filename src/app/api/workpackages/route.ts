import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const workPackages = await prisma.workPackage.findMany({
    include: { activities: { orderBy: { code: "asc" } } },
    orderBy: { code: "asc" },
  });

  return NextResponse.json(workPackages);
}
