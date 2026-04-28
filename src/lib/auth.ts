import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { v4 as uuid } from "uuid";

const SESSION_COOKIE = "stoz_session";
const SESSION_EXPIRY_HOURS = 72;
const MAGIC_LINK_EXPIRY_MINUTES = 15;

export async function createMagicLink(email: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return null;

  const token = uuid();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000);

  await prisma.magicLink.create({
    data: { userId: user.id, token, expiresAt },
  });

  return { token, user };
}

export async function verifyMagicLink(token: string) {
  const link = await prisma.magicLink.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!link || link.used || link.expiresAt < new Date()) return null;

  // Mark as used
  await prisma.magicLink.update({
    where: { id: link.id },
    data: { used: true },
  });

  // Create session
  const sessionToken = uuid();
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000);

  await prisma.session.create({
    data: { userId: link.user.id, token: sessionToken, expiresAt },
  });

  return { sessionToken, user: link.user, expiresAt };
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) return null;

  return session;
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireAuth();
  if (session.user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return session;
}

export function setSessionCookie(token: string, expiresAt: Date) {
  // This returns the cookie config for the response
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    expires: expiresAt,
    path: "/",
  };
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
  }
}
