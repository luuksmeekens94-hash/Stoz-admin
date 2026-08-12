import Link from "next/link";
import { redirect } from "next/navigation";
import ForecastEntryDeleteButton from "@/components/ForecastEntryDeleteButton";
import ForecastEntryForm from "@/components/ForecastEntryForm";
import PlanningVersionActions from "@/components/PlanningVersionActions";
import MonthlyPlanningApprovalBoard, {
  type MonthlyPlanningApprovalMonth,
} from "@/components/MonthlyPlanningApprovalBoard";
import { getSession } from "@/lib/auth";
import {
  buildCorrectiveMonthlyPlan,
  comparePlanActual,
  forecastExecutorsFor,
  findActualOnlyComparisons,
  resolvePlanActualRoleCategory,
  spreadPlannedHoursAcrossDates,
  type MonthlyPlanSuggestion,
} from "@/lib/monthly-hour-planning";
import { prisma } from "@/lib/prisma";

import { buildCorrectiveActionPlan } from "@/lib/project-progress";
import { buildMonthlyControl } from "@/lib/reporting-control";

export const dynamic = "force-dynamic";

function monthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

function formatHours(value: number) {
  return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(value);
}

export default async function HoursPlanningPage() {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard");
  const asOfKey = new Date().toISOString().slice(0, 10);
  const asOfEnd = new Date(`${asOfKey}T23:59:59.999Z`);
  const asOfLabel = asOfEnd.toLocaleDateString("nl-NL", { timeZone: "UTC" });

  const [latestVersion, versionCount, approvedEntries, budgetAllocations] = await Promise.all([
    prisma.planningVersion.findFirst({
      orderBy: { revision: "desc" },
      include: {
        allocations: {
          orderBy: [{ monthStart: "asc" }, { label: "asc" }],
          include: {
            workPackage: { select: { code: true } },
            activity: { select: { code: true } },
            forecastEntries: { orderBy: [{ plannedDate: "asc" }, { executorName: "asc" }] },
          },
        },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.planningVersion.count(),
    prisma.hourEntry.findMany({
      where: {
        status: "APPROVED",
        date: {
          gte: new Date("2026-08-01T00:00:00.000Z"),
          lte: asOfEnd,
        },
      },
      select: {
        date: true,
        hours: true,
        userId: true,
        workPackage: { select: { code: true } },
        activity: { select: { code: true } },
      },
    }),
    prisma.budgetAllocation.findMany({
      where: { userId: { not: null } },
      select: { userId: true, category: true },
    }),
  ]);
  const hasFutureRebalance = latestVersion
    ? Boolean(await prisma.auditEvent.findFirst({
        where: {
          entityType: "PlanningVersion",
          entityId: `${latestVersion.id}:future-rebalance-2026-08-v2`,
          action: "REBALANCED_FUTURE_OPERATIONAL_FORECAST",
        },
        select: { id: true },
      }))
    : false;

  const preview = buildCorrectiveMonthlyPlan();
  const rows: MonthlyPlanSuggestion[] = latestVersion
    ? latestVersion.allocations.map((allocation) => ({
        monthKey: monthKey(allocation.monthStart),
        budgetLineKey: allocation.budgetLineKey,
        roleCategory: allocation.roleCategory,
        label: allocation.label,
        workPackageCode: allocation.workPackage.code as MonthlyPlanSuggestion["workPackageCode"],
        activityCode: allocation.activity.code as MonthlyPlanSuggestion["activityCode"],
        plannedHours: allocation.plannedHours,
        rationale: allocation.rationale,
        sourceState: allocation.sourceState,
        canMaterialize: false,
        registrationPreparation: "PREFILL_ONLY_AFTER_EXECUTION",
      }))
    : preview.flatMap((month) => month.suggestions);

  const categoryByUserId = new Map(
    budgetAllocations.flatMap((row) => (row.userId ? [[row.userId, row.category] as const] : [])),
  );
  const planActual = comparePlanActual(
    rows.map((row) => ({
      monthKey: row.monthKey,
      roleCategory: row.roleCategory,
      workPackageCode: row.workPackageCode,
      activityCode: row.activityCode,
      plannedHours: row.plannedHours,
    })),
    approvedEntries.map((entry) => ({
      monthKey: monthKey(entry.date),
      roleCategory: resolvePlanActualRoleCategory({
        budgetCategory: categoryByUserId.get(entry.userId) || "Niet aan begrotingscategorie gekoppeld",
        workPackageCode: entry.workPackage.code,
      }),
      workPackageCode: entry.workPackage.code,
      activityCode: entry.activity.code,
      actualHours: entry.hours,
    })),
  );

  const rowsByMonth = new Map<string, MonthlyPlanSuggestion[]>();
  for (const row of rows) {
    rowsByMonth.set(row.monthKey, [...(rowsByMonth.get(row.monthKey) ?? []), row]);
  }
  const displayMonthKeys = Array.from(
    new Set([...Array.from(rowsByMonth.keys()), ...planActual.map((row) => row.monthKey)]),
  ).sort();

  const totalForecastHours = rows.reduce((sum, row) => sum + row.plannedHours, 0);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const correctiveActions = buildCorrectiveActionPlan();
  const approvalMonths: MonthlyPlanningApprovalMonth[] = [];
  if (latestVersion) {
    const grouped = new Map<
      string,
      {
        totalHours: number;
        reviewState: "DRAFT" | "REVIEWED";
        roles: Map<string, { hours: number; detailCount: number }>;
      }
    >();
    for (const allocation of latestVersion.allocations) {
      const key = monthKey(allocation.monthStart);
      if (key < currentMonth) continue;
      const month = grouped.get(key) || {
        totalHours: 0,
        reviewState: "REVIEWED" as const,
        roles: new Map<string, { hours: number; detailCount: number }>(),
      };
      month.totalHours += allocation.plannedHours;
      if (allocation.reviewState === "DRAFT") month.reviewState = "DRAFT";
      const role = month.roles.get(allocation.roleCategory) || { hours: 0, detailCount: 0 };
      role.hours += allocation.plannedHours;
      role.detailCount += allocation.forecastEntries.length;
      month.roles.set(allocation.roleCategory, role);
      grouped.set(key, month);
    }
    for (const [key, month] of Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b))) {
      approvalMonths.push({
        monthKey: key,
        monthLabel: new Date(`${key}-01T00:00:00.000Z`).toLocaleDateString("nl-NL", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }),
        totalHours: Math.round(month.totalHours * 100) / 100,
        reviewState: month.reviewState,
        roles: Array.from(month.roles.entries())
          .map(([label, role]) => ({
            label,
            hours: Math.round(role.hours * 100) / 100,
            detailCount: role.detailCount,
          }))
          .sort((a, b) => a.label.localeCompare(b.label, "nl")),
      });
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-700">Maandelijkse urenplanning</p>
          <h1 className="mt-1 text-3xl font-bold">Uren per functie klaarzetten en goedkeuren</h1>
          <p className="mt-2 max-w-4xl text-gray-600">
            De verwachte inzet staat per maand en functie klaar. Controleer de maand en keur deze met één knop goed.
          </p>
        </div>
        <PlanningVersionActions
          hasVersion={Boolean(latestVersion)}
          hasFutureRebalance={hasFutureRebalance}
        />
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="card">
          <p className="text-sm text-gray-500">Bronstatus</p>
          <p className="mt-1 font-semibold text-emerald-800">Formeel gereconcilieerd — Model B + RVO-beschikking</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Operationele forecast</p>
          <p className="mt-1 text-2xl font-bold">{formatHours(totalForecastHours)} uur</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Opgeslagen revisie</p>
          <p className="mt-1 text-2xl font-bold">
            {latestVersion ? `v${latestVersion.revision}` : "Nog geen"}
          </p>
          <p className="mt-1 text-xs text-gray-500">{versionCount} versie(s) append-only bewaard</p>
        </div>
      </section>

      {latestVersion && approvalMonths.length > 0 && (
        <MonthlyPlanningApprovalBoard months={approvalMonths} />
      )}

      <section className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-950">
        <h2 className="font-bold">Forecastafspraken</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Dit is een werkverwachting en geen claim dat uren zijn gemaakt.</li>
          <li>Iedere forecastregel bewaart verplicht een concrete datum, uitvoerder en uren.</li>
          <li>Een registratievoorstel vult alleen werkpakket, activiteit en toelichting vooraf in.</li>
          <li>Werkelijk uitgevoerde datum, uitvoerder en uren worden daarna apart bevestigd.</li>
          <li>Operationeel benodigde inzet mag ook boven een subsidiebudget worden gepland; financiële dekking en afwijking blijven apart zichtbaar.</li>
        </ul>
      </section>

      <details className="rounded-xl border border-gray-200 bg-white p-4">
        <summary className="cursor-pointer font-semibold text-gray-800">
          Uitgebreide planning, datums en afwijkingen bekijken
        </summary>
        <section className="mt-6 space-y-6">
        {displayMonthKeys.map((key) => {
          const monthRows = rowsByMonth.get(key) || [];
          const monthTotal = monthRows.reduce((sum, row) => sum + row.plannedHours, 0);
          const monthComparisons = planActual.filter((row) => row.monthKey === key);
          const actualTotal = monthComparisons.reduce((sum, row) => sum + row.actualHours, 0);
          const dimensionalMismatchCount = monthComparisons.filter(
            (row) => Math.abs(row.varianceHours) > 0.01,
          ).length;
          const actualOnlyRows = findActualOnlyComparisons(monthComparisons);
          const control = buildMonthlyControl({
            monthKey: key,
            currentMonth,
            asOfDate: asOfKey,
            plannedHours: monthTotal,
            approvedActualHours: actualTotal,
            actions: correctiveActions,
          });
          const stateLabel =
            control.state === "PAST"
              ? "afgesloten maand · afwijking verklaren"
              : control.state === "CURRENT"
                ? "lopende maand · uitvoering bevestigen"
                : "toekomst · voorbereiden";

          return (
            <article key={key} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-5 py-4">
                <div>
                  <h2 className="text-xl font-bold">
                    {new Date(`${key}-01T00:00:00.000Z`).toLocaleDateString("nl-NL", {
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    })}
                  </h2>
                  <p className="text-sm text-gray-500">
                    Forecast {formatHours(monthTotal)} uur · goedgekeurde realisatie t/m {asOfLabel} {formatHours(actualTotal)} uur
                  </p>
                </div>
                <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                  {stateLabel}
                </span>
                {dimensionalMismatchCount > 0 && (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                    {dimensionalMismatchCount} afwijking(en) op rol/WP/activiteit
                  </span>
                )}
              </div>

              <div className="border-b border-blue-100 bg-blue-50/70 px-5 py-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div><p className="text-xs text-gray-500">Forecast</p><p className="font-bold">{formatHours(control.plannedHours)} u</p></div>
                  <div><p className="text-xs text-gray-500">Goedgekeurd werkelijk</p><p className="font-bold">{formatHours(control.approvedActualHours)} u</p></div>
                  <div><p className="text-xs text-gray-500">Controleverschil</p><p className="font-bold">{control.varianceHours > 0 ? "+" : ""}{formatHours(control.varianceHours)} u</p></div>
                </div>
                <p className="mt-3 text-sm text-blue-950">{control.guidance}</p>
                {control.actions.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-blue-800">Wat moet deze maand inhoudelijk gebeuren</p>
                    <ul className="mt-1 space-y-2 text-sm text-blue-950">
                      {control.actions.map((action) => (
                        <li key={action.id}>
                          <span className="font-semibold">{action.title}</span> — {action.deliverable}
                          <span className="block text-xs text-blue-800">Bewijs: {action.evidenceNeeded.join(" · ")}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="divide-y divide-gray-100">
                {monthRows.map((row) => {
                  const comparison = monthComparisons.find(
                    (item) =>
                      item.roleCategory === row.roleCategory &&
                      item.workPackageCode === row.workPackageCode &&
                      item.activityCode === row.activityCode,
                  );
                  const allocation = latestVersion?.allocations.find(
                    (item) =>
                      monthKey(item.monthStart) === row.monthKey &&
                      item.budgetLineKey === row.budgetLineKey &&
                      item.workPackage.code === row.workPackageCode &&
                      item.activity.code === row.activityCode,
                  );
                  const forecastEntries = allocation?.forecastEntries.length
                    ? allocation.forecastEntries.map((entry) => ({
                        id: entry.id,
                        plannedDate: entry.plannedDate.toISOString().slice(0, 10),
                        executorName: entry.executorName,
                        plannedHours: entry.plannedHours,
                        note: entry.note,
                      }))
                    : row.plannedHours > 0
                      ? spreadPlannedHoursAcrossDates(row.monthKey, row.plannedHours).map((entry, index) => ({
                          id: null,
                          plannedDate: entry.date,
                          executorName: forecastExecutorsFor(row.roleCategory)[index % forecastExecutorsFor(row.roleCategory).length],
                          plannedHours: entry.hours,
                          note: row.rationale,
                        }))
                      : [];
                  const registrationUrl = `/uren/nieuw?wp=${encodeURIComponent(row.workPackageCode)}&activity=${encodeURIComponent(row.activityCode)}&description=${encodeURIComponent(`${row.label} — werkelijk uitgevoerd werk volgens operationele forecast ${row.monthKey}`)}`;
                  return (
                    <div key={`${row.budgetLineKey}-${row.workPackageCode}-${row.activityCode}`} className="p-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-gray-950">{row.label}</h3>
                            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                              {row.workPackageCode}/{row.activityCode}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-gray-600">{row.rationale}</p>
                          {forecastEntries.length > 0 && (
                            <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
                              <div className="grid grid-cols-[115px_1fr_80px_auto] gap-3 border-b border-gray-100 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                <span>Datum</span><span>Uitvoerder</span><span className="text-right">Uren</span><span></span>
                              </div>
                              {forecastEntries.map((entry) => (
                                <div key={entry.id ?? `${entry.plannedDate}-${entry.executorName}`} className="grid grid-cols-[115px_1fr_80px_auto] gap-3 border-b border-gray-100 px-3 py-2 text-sm last:border-b-0">
                                  <span>{entry.plannedDate}</span>
                                  <span><span className="font-medium">{entry.executorName}</span>{entry.note && <span className="block text-xs text-gray-500">{entry.note}</span>}</span>
                                  <span className="text-right font-semibold">{formatHours(entry.plannedHours)} u</span>
                                  <span>{entry.id && <ForecastEntryDeleteButton id={entry.id} />}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {allocation && (
                            <ForecastEntryForm
                              allocationId={allocation.id}
                              defaultDate={forecastEntries[0]?.plannedDate || `${row.monthKey}-15`}
                              defaultExecutor={forecastExecutorsFor(row.roleCategory)[0]}
                            />
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold">{formatHours(row.plannedHours)} u forecast</p>
                          <p className="text-xs text-gray-600">
                            werkelijk {formatHours(comparison?.actualHours ?? 0)} u · verschil{" "}
                            {(comparison?.varianceHours ?? -row.plannedHours) > 0 ? "+" : ""}
                            {formatHours(comparison?.varianceHours ?? -row.plannedHours)} u
                          </p>
                          <p className="text-xs text-gray-500">forecast is geen urenboeking</p>
                          {row.monthKey <= currentMonth && (
                            <Link href={registrationUrl} className="mt-2 inline-block text-sm font-semibold text-primary-700 hover:underline">
                              Registratie voorbereiden →
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {actualOnlyRows.map((comparison) => (
                  <div
                    key={`actual-only-${comparison.roleCategory}-${comparison.workPackageCode}-${comparison.activityCode}`}
                    className="border-l-4 border-amber-500 bg-amber-50 p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="font-semibold text-amber-950">
                          Ongeplande realisatie · {comparison.roleCategory}
                        </h3>
                        <p className="mt-1 text-sm text-amber-900">
                          {comparison.workPackageCode}/{comparison.activityCode} heeft goedgekeurde uren maar geen forecastregel op dezelfde rol/WP/activiteit-combinatie.
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-amber-950">{formatHours(comparison.actualHours)} u werkelijk</p>
                        <p className="text-xs text-amber-800">forecast 0 u · afwijking +{formatHours(comparison.varianceHours)} u</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
        </section>
      </details>

      {latestVersion && (
        <footer className="text-xs text-gray-500">
          Revisie {latestVersion.revision}, aangemaakt door {latestVersion.createdBy.name} op{" "}
          {latestVersion.createdAt.toLocaleString("nl-NL")}. Bron: {latestVersion.sourceReference}
        </footer>
      )}
    </div>
  );
}
