import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const deleted = await prisma.$transaction(async (tx) => {
      const entry = await tx.forecastEntry.findUnique({
        where: { id },
        include: { materializedHourEntry: { select: { id: true } } },
      });
      if (!entry) throw new Error("FORECAST_ENTRY_NOT_FOUND");
      const allocation = await tx.monthlyPlanAllocation.findUnique({
        where: { id: entry.allocationId },
        include: { planningVersion: { select: { status: true } } },
      });
      if (!allocation) throw new Error("FORECAST_ALLOCATION_NOT_FOUND");
      if (allocation.planningVersion.status !== "CONCEPT") {
        throw new Error("FORECAST_VERSION_LOCKED");
      }
      if (allocation.reviewState === "REVIEWED") {
        throw new Error("FORECAST_MONTH_REVIEWED");
      }
      if (entry.materializedHourEntry) {
        throw new Error("FORECAST_ENTRY_MATERIALIZED");
      }
      const detailAggregate = await tx.forecastEntry.aggregate({
        where: { allocationId: entry.allocationId },
        _sum: { plannedHours: true },
      });
      const detailTotalBefore = detailAggregate._sum.plannedHours ?? 0;
      if (Math.abs(detailTotalBefore - allocation.plannedHours) > 0.001) {
        throw new Error("FORECAST_TOTAL_INTEGRITY_ERROR");
      }

      await tx.forecastEntry.delete({ where: { id } });
      await tx.monthlyPlanAllocation.update({
        where: { id: entry.allocationId },
        data: { plannedHours: detailTotalBefore - entry.plannedHours },
      });
      await tx.auditEvent.create({
        data: {
          entityType: "ForecastEntry",
          entityId: entry.id,
          action: "FORECAST_ENTRY_DELETED",
          reason: "Operationele forecastregel verwijderd; maandtotaal transactioneel bijgewerkt.",
          beforeData: { plannedDate: entry.plannedDate, executorName: entry.executorName, plannedHours: entry.plannedHours, note: entry.note, allocationPlannedHours: detailTotalBefore },
          afterData: { allocationPlannedHours: detailTotalBefore - entry.plannedHours },
          actorUserId: session.user.id,
        },
      });
      return entry;
    }, { isolationLevel: "Serializable" });

    return NextResponse.json({ ok: true, id: deleted.id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Forecast verwijderen mislukt";
    const status =
      message === "UNAUTHORIZED" ? 401
        : message === "FORBIDDEN" ? 403
          : message === "FORECAST_ENTRY_NOT_FOUND" || message === "FORECAST_ALLOCATION_NOT_FOUND" ? 404
            : message === "FORECAST_VERSION_LOCKED" || message === "FORECAST_MONTH_REVIEWED" || message === "FORECAST_ENTRY_MATERIALIZED" ? 409
            : message === "FORECAST_TOTAL_INTEGRITY_ERROR" ? 409
              : error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" ? 409
                : 500;
    const publicMessage =
      message === "FORECAST_ENTRY_NOT_FOUND" ? "Forecastregel niet gevonden."
        : message === "FORECAST_VERSION_LOCKED" ? "Deze planningversie is niet meer wijzigbaar."
          : message === "FORECAST_MONTH_REVIEWED" ? "Deze planmaand is goedgekeurd en kan niet meer worden gewijzigd."
            : message === "FORECAST_ENTRY_MATERIALIZED" ? "Deze forecastregel is al als urenconcept geregistreerd en kan niet meer worden verwijderd."
        : message === "FORECAST_TOTAL_INTEGRITY_ERROR" ? "Forecasttotaal is inconsistent; verwijderen is geblokkeerd."
          : status === 409 ? "De forecast is gelijktijdig gewijzigd; vernieuw de pagina en probeer opnieuw."
            : "Forecast verwijderen mislukt.";
    return NextResponse.json({ error: publicMessage }, { status });
  }
}
