import { NextRequest, NextResponse } from "next/server";
import { verifyMagicLink, setSessionCookie } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ error: "Token ontbreekt" }, { status: 400 });
    }

    const result = await verifyMagicLink(token);

    if (!result) {
      return NextResponse.json(
        { error: "Ongeldige of verlopen link. Vraag een nieuwe aan." },
        { status: 401 }
      );
    }

    const response = NextResponse.json({ ok: true, user: result.user });
    const cookie = setSessionCookie(result.sessionToken, result.expiresAt);
    response.cookies.set(cookie);

    return response;
  } catch (error) {
    console.error("Verify error:", error);
    return NextResponse.json({ error: "Interne fout" }, { status: 500 });
  }
}
