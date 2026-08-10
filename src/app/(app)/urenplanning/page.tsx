import Link from "next/link";
import { redirect } from "next/navigation";
import PlanningVersionActions from "@/components/PlanningVersionActions";
import { getSession } from "@/lib/auth";
import {
  buildCorrectiveMonthlyPlan,
  comparePlanActual,
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
          include: { workPackage: { select: { code: true } }, activity: { select: { code: true } } },
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
        registrationPreparation:
          allocation.sourceState === "APPROVED_REMAINING"
            ? "PREFILL_ONLY_AFTER_EXECUTION"
            : "BLOCKED_PENDING_DECISION",
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
      plannedHours: row.sourceState === "APPROVED_REMAINING" ? row.plannedHours : 0,
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

  const approvedForecastHours = rows
    .filter((row) => row.sourceState === "APPROVED_REMAINING")
    .reduce((sum, row) => sum + row.plannedHours, 0);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const correctiveActions = buildCorrectiveActionPlan();

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-700">
            Operationele forecast · geen realisatie
          </p>
          <h1 className="mt-1 text-3xl font-bold">Urenplanning augustus 2026–augustus 2027</h1>
          <p className="mt-2 max-w-4xl text-gray-600">
            Stuur per maand op rol en werkpakket. Planregels staan volledig los van de urenadministratie;
            alleen werkelijk uitgevoerd werk mag via een afzonderlijk formulier worden geregistreerd.
          </p>
        </div>
        <PlanningVersionActions hasVersion={Boolean(latestVersion)} />
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="card">
          <p className="text-sm text-gray-500">Bronstatus</p>
          <p className="mt-1 font-semibold text-amber-800">Gereconstrueerd — officiële RVO-XLSX ontbreekt</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Resterende operationele bovengrens</p>
          <p className="mt-1 text-2xl font-bold">{formatHours(approvedForecastHours)} uur</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Opgeslagen revisie</p>
          <p className="mt-1 text-2xl font-bold">
            {latestVersion ? `v${latestVersion.revision}` : "Nog geen"}
          </p>
          <p className="mt-1 text-xs text-gray-500">{versionCount} versie(s) append-only bewaard</p>
        </div>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
        <h2 className="font-bold">Veiligheidsgrens</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Dit is een werkverwachting en geen claim dat uren zijn gemaakt.</li>
          <li>Voorgestelde data zijn spreidingshulpjes, geen uitvoeringsdata.</li>
          <li>Een registratievoorstel vult alleen werkpakket, activiteit en toelichting vooraf in.</li>
          <li>Datum, uitvoerder en werkelijk aantal uren moeten daarna handmatig worden bevestigd.</li>
          <li>Website-uren boven de goedgekeurde hoeveelheid blijven geblokkeerd.</li>
        </ul>
      </section>

      <section className="space-y-6">
        {Array.from(rowsByMonth.entries()).map(([key, monthRows]) => {
          const monthTotal = monthRows
            .filter((row) => row.sourceState === "APPROVED_REMAINING")
            .reduce((sum, row) => sum + row.plannedHours, 0);
          const monthComparisons = planActual.filter((row) => row.monthKey === key);
          const actualTotal = monthComparisons.reduce((sum, row) => sum + row.actualHours, 0);
          const dimensionalMismatchCount = monthComparisons.filter(
            (row) => Math.abs(row.varianceHours) > 0.01,
          ).length;
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
                  const dates =
                    row.plannedHours > 0
                      ? spreadPlannedHoursAcrossDates(row.monthKey, row.plannedHours)
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
                            {row.sourceState === "DECISION_REQUIRED" && (
                              <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                                besluit vereist
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-gray-600">{row.rationale}</p>
                          {dates.length > 0 && (
                            <p className="mt-2 text-xs text-gray-500">
                              Voorgestelde werkdagen: {dates.map((date) => `${date.date} (${formatHours(date.hours)}u)`).join(" · ")}
                            </p>
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
                          {row.sourceState === "APPROVED_REMAINING" && row.monthKey <= currentMonth && (
                            <Link href={registrationUrl} className="mt-2 inline-block text-sm font-semibold text-primary-700 hover:underline">
                              Registratie voorbereiden →
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </section>

      {latestVersion && (
        <footer className="text-xs text-gray-500">
          Revisie {latestVersion.revision}, aangemaakt door {latestVersion.createdBy.name} op{" "}
          {latestVersion.createdAt.toLocaleString("nl-NL")}. Bron: {latestVersion.sourceReference}
        </footer>
      )}
    </div>
  );
}
