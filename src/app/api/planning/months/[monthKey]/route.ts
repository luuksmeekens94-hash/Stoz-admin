import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  PlanningMonthReviewError,
  validatePlanningMonthForApproval,
} from "@/lib/planning-month-review";

function monthRange(monthKey: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
    throw new PlanningMonthReviewError("De gekozen planmaand is ongeldig.");
  }
  const [year, month] = monthKey.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

export async function PATCH(
  _request: Request,
  context: { params: Promise<{ monthKey: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Alleen een beheerder kan een planmaand goedkeuren" }, { status: 403 });
  }

  try {
    const { monthKey } = await context.params;
    const { start, end } = monthRange(monthKey);
    const result = await prisma.$transaction(
      async (tx) => {
        const version = await tx.planningVersion.findFirst({
          where: { status: "CONCEPT" },
          orderBy: { revision: "desc" },
          select: {
            id: true,
            revision: true,
            allocations: {
              where: { monthStart: { gte: start, lt: end } },
              orderBy: [{ roleCategory: "asc" }, { budgetLineKey: "asc" }],
              select: {
                id: true,
                plannedHours: true,
                reviewState: true,
                forecastEntries: {
                  orderBy: [{ plannedDate: "asc" }, { executorName: "asc" }],
                  select: {
                    plannedDate: true,
                    executorName: true,
                    plannedHours: true,
                  },
                },
              },
            },
          },
        });
        if (!version) {
          throw new PlanningMonthReviewError("Er is geen actieve conceptplanning gevonden.");
        }

        const summary = validatePlanningMonthForApproval(monthKey, version.allocations);
        const entityId = `${version.id}:${monthKey}`;
        const alreadyReviewed = version.allocations.every(
          (allocation) => allocation.reviewState === "REVIEWED",
        );
        if (alreadyReviewed) {
          return { ...summary, revision: version.revision, monthKey, idempotent: true as const };
        }

        const changed = await tx.monthlyPlanAllocation.updateMany({
          where: {
            planningVersionId: version.id,
            monthStart: { gte: start, lt: end },
            reviewState: "DRAFT",
          },
          data: { reviewState: "REVIEWED" },
        });
        if (changed.count === 0) {
          throw new PlanningMonthReviewError("De planmaand is gelijktijdig gewijzigd. Vernieuw de pagina.");
        }

        await tx.auditEvent.create({
          data: {
            entityType: "PlanningMonth",
            entityId,
            action: "APPROVED_MONTHLY_OPERATIONAL_FORECAST",
            reason: `Operationele forecast voor ${monthKey} goedgekeurd door beheerder.`,
            beforeData: {
              revision: version.revision,
              reviewState: "DRAFT",
              ...summary,
            },
            afterData: {
              revision: version.revision,
              reviewState: "REVIEWED",
              ...summary,
            },
            actorUserId: session.user.id,
          },
        });

        return { ...summary, revision: version.revision, monthKey, idempotent: false as const };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PlanningMonthReviewError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json(
        { error: "De planmaand is gelijktijdig gewijzigd. Vernieuw de pagina en probeer opnieuw." },
        { status: 409 },
      );
    }
    console.error("Planning month approval error:", error);
    return NextResponse.json({ error: "Planmaand goedkeuren mislukt." }, { status: 500 });
  }
}
