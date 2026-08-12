import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertNoDirectIdentifiers, PrivacyTextError } from "@/lib/privacy-text";

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function parseQuarterHours(value: unknown): number | null {
  const hours = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24 || Math.round(hours * 4) !== hours * 4) {
    return null;
  }
  return hours;
}

export async function POST(request: Request) {
  try {
    const session = await requireAdmin();
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
    }

    const input = body as Record<string, unknown>;
    const allocationId = typeof input.allocationId === "string" ? input.allocationId.trim() : "";
    const executorName = typeof input.executorName === "string"
      ? input.executorName.trim().replace(/\s+/g, " ")
      : "";
    const note = typeof input.note === "string" ? input.note.trim() : "";
    const plannedDate = parseDate(input.plannedDate);
    const plannedHours = parseQuarterHours(input.plannedHours);

    if (!allocationId || !plannedDate || !plannedHours || executorName.length < 2 || executorName.length > 120) {
      return NextResponse.json(
        { error: "Forecast vereist een geldige datum, uitvoerder en positieve kwartieruren." },
        { status: 400 },
      );
    }
    if (note.length > 500) {
      return NextResponse.json({ error: "Toelichting is maximaal 500 tekens." }, { status: 400 });
    }
    assertNoDirectIdentifiers(note, "forecasttoelichting");

    const result = await prisma.$transaction(async (tx) => {
      const allocation = await tx.monthlyPlanAllocation.findUnique({
        where: { id: allocationId },
        include: {
          planningVersion: {
            select: { status: true, periodStart: true, periodEnd: true },
          },
        },
      });
      if (!allocation) throw new Error("FORECAST_ALLOCATION_NOT_FOUND");
      if (allocation.planningVersion.status !== "CONCEPT") {
        throw new Error("FORECAST_VERSION_LOCKED");
      }
      if (allocation.reviewState === "REVIEWED") {
        throw new Error("FORECAST_MONTH_REVIEWED");
      }
      if (plannedDate < allocation.planningVersion.periodStart || plannedDate > allocation.planningVersion.periodEnd) {
        throw new Error("FORECAST_DATE_OUTSIDE_PERIOD");
      }
      if (plannedDate.toISOString().slice(0, 7) !== allocation.monthStart.toISOString().slice(0, 7)) {
        throw new Error("FORECAST_DATE_OUTSIDE_MONTH");
      }

      const detailAggregate = await tx.forecastEntry.aggregate({
        where: { allocationId },
        _sum: { plannedHours: true },
      });
      const detailTotalBefore = detailAggregate._sum.plannedHours ?? 0;
      if (Math.abs(detailTotalBefore - allocation.plannedHours) > 0.001) {
        throw new Error("FORECAST_TOTAL_INTEGRITY_ERROR");
      }

      const [existing, dailyAggregate] = await Promise.all([
        tx.forecastEntry.findFirst({
          where: {
            allocationId,
            plannedDate,
            executorName: { equals: executorName, mode: "insensitive" },
          },
          include: { materializedHourEntry: { select: { id: true } } },
        }),
        tx.forecastEntry.aggregate({
          where: {
            plannedDate,
            executorName: { equals: executorName, mode: "insensitive" },
          },
          _sum: { plannedHours: true },
        }),
      ]);
      if (existing?.materializedHourEntry) {
        throw new Error("FORECAST_ENTRY_MATERIALIZED");
      }
      const dailyExecutorHours = dailyAggregate._sum.plannedHours ?? 0;
      if (dailyExecutorHours + plannedHours > 24) {
        throw new Error("FORECAST_DAILY_EXECUTOR_LIMIT");
      }
      const entry = existing
        ? await tx.forecastEntry.update({
            where: { id: existing.id },
            data: {
              plannedHours: { increment: plannedHours },
              note: note || existing.note,
            },
          })
        : await tx.forecastEntry.create({
            data: {
              allocationId,
              plannedDate,
              executorName,
              plannedHours,
              note: note || null,
            },
          });

      await tx.monthlyPlanAllocation.update({
        where: { id: allocationId },
        data: { plannedHours: detailTotalBefore + plannedHours },
      });
      await tx.auditEvent.create({
        data: {
          entityType: "ForecastEntry",
          entityId: entry.id,
          action: existing ? "FORECAST_HOURS_ADDED" : "FORECAST_ENTRY_CREATED",
          reason: "Operationele forecast vastgelegd met verplichte datum, uitvoerder en uren.",
          beforeData: existing
            ? { plannedDate: existing.plannedDate, executorName: existing.executorName, plannedHours: existing.plannedHours, note: existing.note, allocationPlannedHours: detailTotalBefore }
            : undefined,
          afterData: { plannedDate: entry.plannedDate, executorName: entry.executorName, plannedHours: entry.plannedHours, note: entry.note, allocationPlannedHours: detailTotalBefore + plannedHours },
          actorUserId: session.user.id,
        },
      });
      return entry;
    }, { isolationLevel: "Serializable" });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Ongeldige JSON" }, { status: 400 });
    if (error instanceof PrivacyTextError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Forecast opslaan mislukt";
    const status =
      message === "UNAUTHORIZED" ? 401
        : message === "FORBIDDEN" ? 403
          : message === "FORECAST_ALLOCATION_NOT_FOUND" ? 404
            : message === "FORECAST_DATE_OUTSIDE_PERIOD" || message === "FORECAST_DATE_OUTSIDE_MONTH" ? 409
              : message === "FORECAST_VERSION_LOCKED" || message === "FORECAST_MONTH_REVIEWED" ? 409
              : message === "FORECAST_DAILY_EXECUTOR_LIMIT" || message === "FORECAST_ENTRY_MATERIALIZED" ? 409
                : message === "FORECAST_TOTAL_INTEGRITY_ERROR" ? 409
                : error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2034" || error.code === "P2002") ? 409
                : 500;
    const publicMessage =
      message === "FORECAST_DATE_OUTSIDE_PERIOD" ? "Datum valt buiten de forecastperiode."
        : message === "FORECAST_DATE_OUTSIDE_MONTH" ? "Datum moet binnen de gekozen forecastmaand vallen."
          : message === "FORECAST_ALLOCATION_NOT_FOUND" ? "Forecastregel niet gevonden."
            : message === "FORECAST_VERSION_LOCKED" ? "Deze planningversie is niet meer wijzigbaar."
              : message === "FORECAST_MONTH_REVIEWED" ? "Deze planmaand is goedgekeurd en kan niet meer worden gewijzigd."
            : message === "FORECAST_ENTRY_MATERIALIZED" ? "Deze forecastregel is al als urenconcept geregistreerd en kan niet meer worden gewijzigd."
              : message === "FORECAST_DAILY_EXECUTOR_LIMIT" ? "Per uitvoerder kan maximaal 24 uur op één datum worden gepland."
              : message === "FORECAST_TOTAL_INTEGRITY_ERROR" ? "Forecasttotaal is inconsistent; wijziging is geblokkeerd."
              : status === 409 ? "De forecast is gelijktijdig gewijzigd; vernieuw de pagina en probeer opnieuw."
                : "Forecast opslaan mislukt.";
    return NextResponse.json({ error: publicMessage }, { status });
  }
}
