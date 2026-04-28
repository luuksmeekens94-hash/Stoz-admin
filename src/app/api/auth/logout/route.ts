import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

export async function POST() {
  await destroySession();
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("stoz_session");
  return response;
}
