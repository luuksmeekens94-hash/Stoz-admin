import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import {
  assertAutomaticPlanningCreationAllowed,
  buildCorrectiveMonthlyPlan,
} from "@/lib/monthly-hour-planning";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    const session = await requireAdmin();
    const plan = buildCorrectiveMonthlyPlan();
    const suggestions = plan.flatMap((month) => month.suggestions);
    const workPackageCodes = Array.from(new Set(suggestions.map((row) => row.workPackageCode)));
    const activityCodes = Array.from(new Set(suggestions.map((row) => row.activityCode)));

    const [workPackages, activities] = await Promise.all([
      prisma.workPackage.findMany({
        where: { code: { in: workPackageCodes } },
        select: { id: true, code: true },
      }),
      prisma.activity.findMany({
        where: { code: { in: activityCodes } },
        select: { id: true, code: true, workPackage: { select: { code: true } } },
      }),
    ]);

    const workPackageByCode = new Map(workPackages.map((row) => [row.code, row.id]));
    const activityByCode = new Map(activities.map((row) => [row.code, row]));
    for (const suggestion of suggestions) {
      const activity = activityByCode.get(suggestion.activityCode);
      if (!workPackageByCode.has(suggestion.workPackageCode) || !activity) {
        return NextResponse.json(
          { error: `Configuratie ontbreekt voor ${suggestion.workPackageCode}/${suggestion.activityCode}` },
          { status: 409 },
        );
      }
      if (activity.workPackage.code !== suggestion.workPackageCode) {
        return NextResponse.json(
          { error: `Activiteit ${suggestion.activityCode} hoort niet bij ${suggestion.workPackageCode}` },
          { status: 409 },
        );
      }
    }

    let version: { id: string; revision: number } | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        version = await prisma.$transaction(async (tx) => {
      const existingVersionCount = await tx.planningVersion.count();
      assertAutomaticPlanningCreationAllowed(existingVersionCount);
      const revision = 1;
      const created = await tx.planningVersion.create({
        data: {
          revision,
          status: "CONCEPT",
          sourceStatus: "RECONSTRUCTED_PENDING_APPROVED_XLSX",
          sourceReference:
            "Operationele forecast op basis van de beschikking, huidige administratie en gereconstrueerde resterende hoeveelheden. De officieel aangepaste RVO-begrotingswerkmap ontbreekt nog.",
          periodStart: new Date("2026-08-01T00:00:00.000Z"),
          periodEnd: new Date("2027-08-31T23:59:59.999Z"),
          createdById: session.user.id,
          allocations: {
            create: suggestions.map((suggestion) => ({
              monthStart: new Date(`${suggestion.monthKey}-01T00:00:00.000Z`),
              budgetLineKey: suggestion.budgetLineKey,
              roleCategory: suggestion.roleCategory,
              label: suggestion.label,
              workPackageId: workPackageByCode.get(suggestion.workPackageCode)!,
              activityId: activityByCode.get(suggestion.activityCode)!.id,
              plannedHours: suggestion.plannedHours,
              rationale: suggestion.rationale,
              sourceState: suggestion.sourceState,
              reviewState: "DRAFT",
            })),
          },
        },
        select: { id: true, revision: true },
      });

      await tx.auditEvent.create({
        data: {
          entityType: "PlanningVersion",
          entityId: created.id,
          action: "CREATED_OPERATIONAL_FORECAST",
          reason: `Conceptversie ${created.revision} aangemaakt; geen urenregistraties gegenereerd.`,
          afterData: {
            revision: created.revision,
            allocationCount: suggestions.length,
            sourceStatus: "RECONSTRUCTED_PENDING_APPROVED_XLSX",
          },
          actorUserId: session.user.id,
        },
      });
          return created;
        }, { isolationLevel: "Serializable" });
        break;
      } catch (error) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === "P2034" || error.code === "P2002");
        if (retryable && attempt === 0) continue;
        throw error;
      }
    }
    if (!version) throw new Error("Conceptplanning aanmaken mislukt na gelijktijdige wijziging.");

    return NextResponse.json(version, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Conceptplanning aanmaken mislukt";
    const status =
      message === "UNAUTHORIZED"
        ? 401
        : message === "FORBIDDEN"
          ? 403
          : message.includes("actualbaseline")
            ? 409
            : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
