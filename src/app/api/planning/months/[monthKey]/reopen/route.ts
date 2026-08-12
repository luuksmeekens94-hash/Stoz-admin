import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertNoDirectIdentifiers, PrivacyTextError } from "@/lib/privacy-text";

function monthRange(monthKey: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) return null;
  const [year, month] = monthKey.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ monthKey: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Alleen een beheerder kan een planmaand heropenen." }, { status: 403 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige JSON-aanvraag." }, { status: 400 });
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return NextResponse.json({ error: "De aanvraag moet een object zijn." }, { status: 400 });
  }
  const body = input as Record<string, unknown>;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (Object.keys(body).some((key) => key !== "reason") || reason.length < 10 || reason.length > 500) {
    return NextResponse.json({ error: "Geef een concrete correctiereden van 10 tot 500 tekens." }, { status: 400 });
  }
  try {
    assertNoDirectIdentifiers(reason, "correctiereden");
    const { monthKey } = await context.params;
    const range = monthRange(monthKey);
    if (!range) return NextResponse.json({ error: "De gekozen planmaand is ongeldig." }, { status: 400 });

    const result = await prisma.$transaction(async (tx) => {
      const version = await tx.planningVersion.findFirst({
        where: { status: "CONCEPT" },
        orderBy: { revision: "desc" },
        select: {
          id: true,
          revision: true,
          allocations: {
            where: { monthStart: { gte: range.start, lt: range.end } },
            select: { id: true, reviewState: true },
          },
        },
      });
      if (!version || version.allocations.length === 0) {
        throw new Error("PLAN_MONTH_NOT_FOUND");
      }
      if (!version.allocations.every((allocation) => allocation.reviewState === "REVIEWED")) {
        throw new Error("PLAN_MONTH_NOT_REVIEWED");
      }

      const changed = await tx.monthlyPlanAllocation.updateMany({
        where: {
          planningVersionId: version.id,
          monthStart: { gte: range.start, lt: range.end },
          reviewState: "REVIEWED",
        },
        data: { reviewState: "DRAFT" },
      });
      if (changed.count !== version.allocations.length) throw new Error("PLAN_MONTH_CONCURRENT_CHANGE");

      await tx.auditEvent.create({
        data: {
          entityType: "PlanningMonth",
          entityId: `${version.id}:${monthKey}`,
          action: "REOPENED_MONTHLY_OPERATIONAL_FORECAST",
          reason,
          beforeData: { revision: version.revision, reviewState: "REVIEWED", allocationCount: version.allocations.length },
          afterData: { revision: version.revision, reviewState: "DRAFT", allocationCount: version.allocations.length },
          actorUserId: session.user.id,
        },
      });
      return { monthKey, revision: version.revision, allocationCount: changed.count, reviewState: "DRAFT" as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PrivacyTextError) return NextResponse.json({ error: error.message }, { status: 400 });
    const message = error instanceof Error ? error.message : "";
    if (message === "PLAN_MONTH_NOT_FOUND") return NextResponse.json({ error: "Planmaand niet gevonden." }, { status: 404 });
    if (message === "PLAN_MONTH_NOT_REVIEWED") return NextResponse.json({ error: "Alleen een volledig goedgekeurde planmaand kan worden heropend." }, { status: 409 });
    if (message === "PLAN_MONTH_CONCURRENT_CHANGE" || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")) {
      return NextResponse.json({ error: "De planmaand is gelijktijdig gewijzigd. Vernieuw de pagina." }, { status: 409 });
    }
    console.error("Planning month reopen error:", error);
    return NextResponse.json({ error: "Planmaand heropenen mislukt." }, { status: 500 });
  }
}
