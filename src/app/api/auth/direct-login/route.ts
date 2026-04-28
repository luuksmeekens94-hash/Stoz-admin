import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import { setSessionCookie } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "userId is verplicht" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "Gebruiker niet gevonden" }, { status: 404 });
    }

    // Create session
    const sessionToken = uuid();
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

    await prisma.session.create({
      data: { userId: user.id, token: sessionToken, expiresAt },
    });

    const cookie = setSessionCookie(sessionToken, expiresAt);
    
    const response = NextResponse.json({ ok: true, user: { id: user.id, name: user.name, role: user.role } });
    response.cookies.set(cookie);
    
    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown";
    console.error("Direct login error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
