import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { randomUUID } from "node:crypto";
import { hashAuthToken } from "./auth-token";

const SESSION_COOKIE = "stoz_session";
const SESSION_EXPIRY_HOURS = 72;
export async function verifyMagicLink(token: string) {
  const sessionToken = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000);
  return prisma.$transaction(async (tx) => {
    const link = await tx.magicLink.findUnique({
      where: { token: hashAuthToken(token) },
      include: { user: true },
    });
    if (!link || link.used || link.expiresAt <= new Date() || !link.user.active) return null;

    const claimed = await tx.magicLink.updateMany({
      where: { id: link.id, used: false, expiresAt: { gt: new Date() } },
      data: { used: true },
    });
    if (claimed.count !== 1) return null;

    await tx.session.create({
      data: { userId: link.user.id, token: hashAuthToken(sessionToken), expiresAt },
    });
    return { sessionToken, user: link.user, expiresAt };
  });
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token: hashAuthToken(token) },
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
    await prisma.session.deleteMany({ where: { token: hashAuthToken(token) } });
  }
}
