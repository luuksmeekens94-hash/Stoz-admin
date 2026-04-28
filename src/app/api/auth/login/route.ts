import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { v4 as uuid } from "uuid";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = body?.email?.toLowerCase()?.trim();

    if (!email) {
      return NextResponse.json({ error: "E-mailadres is verplicht" }, { status: 400 });
    }

    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user) {
      // Don't reveal whether email exists - return ok anyway
      return NextResponse.json({ ok: true, message: "Als dit e-mailadres bekend is, ontvang je een loginlink." });
    }

    // Create magic link
    const token = uuid();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.magicLink.create({
      data: { userId: user.id, token, expiresAt },
    });

    // Build verify URL
    const host = request.headers.get("host") || "stoz-admin.vercel.app";
    const protocol = host.includes("localhost") ? "http" : "https";
    const verifyUrl = `${protocol}://${host}/auth/verify?token=${token}`;

    const response: Record<string, unknown> = { 
      ok: true, 
      message: "Als dit e-mailadres bekend is, ontvang je een loginlink." 
    };

    // In dev mode, return the link directly
    if (process.env.DEV_MODE === "true") {
      response.devLink = verifyUrl;
    }

    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Login error:", message);
    return NextResponse.json({ error: "Interne fout", details: message }, { status: 500 });
  }
}
