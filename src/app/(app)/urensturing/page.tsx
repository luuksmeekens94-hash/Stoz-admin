import Link from "next/link";
import { redirect } from "next/navigation";
import ReportActions from "@/components/ReportActions";
import InvoiceClassificationForm from "@/components/InvoiceClassificationForm";
import { getSession } from "@/lib/auth";
import { buildFinancialSteeringModel, hasValidInvoiceEvidence, type FinancialBlocker } from "@/lib/financial-steering";
import {
  APPROVED_BUDGET_LINES,
  CATEGORY_USER_EMAILS,
  EXPECTED_WORK_PACKAGES_BY_CATEGORY,
  INVOICE_BUDGET_LINE_SUGGESTIONS,
  PROJECT_STEERING_CONFIG,
  SOURCE_NOTES,
  WORK_PACKAGE_PHASES,
} from "@/lib/project-plan";
import {
  buildProjectSteeringModel,
  type HourStatus,
  type ParticipantSignal,
  type WorkPackageSignal,
} from "@/lib/project-steering";
import { buildReportQuestions } from "@/lib/report-questions";
import { assessWorkPackageProgress, buildCorrectiveActionPlan } from "@/lib/project-progress";
import { isWithinReportCutoff, reportCutoffEnd, resolveReportAsOf } from "@/lib/reporting-control";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function amsterdamDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function hours(value: number) {
  return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(value)} u`;
}

function euros(value: number) {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function percentage(value: number) {
  return new Intl.NumberFormat("nl-NL", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function dateLabel(value: string) {
  return new Date(`${value}T12:00:00.000Z`).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Amsterdam",
  });
}

function participantSignal(signal: ParticipantSignal) {
  const labels: Record<ParticipantSignal, { label: string; className: string }> = {
    WITHIN_BUDGET: { label: "Binnen urenbasis", className: "bg-emerald-100 text-emerald-800" },
    OVER_BUDGET: { label: "Urenbasis overschreden", className: "bg-red-100 text-red-800" },
    CHECK_CLASSIFICATION: { label: "Classificatie controleren", className: "bg-amber-100 text-amber-900" },
    NO_REPORTABLE_HOURS: { label: "Geen uren", className: "bg-gray-100 text-gray-700" },
    UNMAPPED: { label: "Persoon ontbreekt", className: "bg-red-100 text-red-800" },
  };
  return labels[signal];
}

function workPackageSignal(signal: WorkPackageSignal) {
  const labels: Record<WorkPackageSignal, { label: string; className: string }> = {
    UPCOMING: { label: "Planperiode komt nog", className: "bg-gray-100 text-gray-700" },
    ACTIVE: { label: "Planperiode actief", className: "bg-blue-100 text-blue-800" },
    PHASE_ENDED: { label: "Planperiode verstreken", className: "bg-violet-100 text-violet-800" },
    CHECK_CLASSIFICATION: { label: "Buiten planperiode", className: "bg-amber-100 text-amber-900" },
    MISSING_REGISTRATION: { label: "Duiding ontbreekt", className: "bg-red-100 text-red-800" },
  };
  return labels[signal];
}

function blockerLabel(blocker: FinancialBlocker) {
  const labels: Record<FinancialBlocker, string> = {
    APPROVED_BUDGET_FILE_MISSING: "Officiële aangepaste RVO-begroting ontbreekt",
    BUDGET_TOTAL_MISMATCH: "Begrotingsregels sluiten niet op het beschikkingstotaal aan",
    HOUR_CLASSIFICATION_PENDING: "Uren vragen herclassificatie naar de juiste begrotingsrol",
    INVOICE_MAPPING_PENDING: "Factuurkoppelingen zijn voorgesteld maar nog niet bevestigd",
    INVOICE_MAPPING_MISSING: "Facturen hebben nog geen begrotingsregel",
    INVOICE_EVIDENCE_MISSING: "Bij één of meer facturen ontbreekt een bewijsbestand",
    INVOICE_AMOUNT_INVALID: "Bij één of meer facturen zijn bedragen negatief, niet-numeriek of intern inconsistent",
    VAT_TREATMENT_PENDING: "De btw-behandeling van gekoppelde facturen wacht nog op expliciete RVO-toetsing",
    EXTERNAL_COST_EVIDENCE_INCOMPLETE: "Externe uren en bevestigde factuurkosten sluiten nog niet aantoonbaar aan",
  };
  return labels[blocker];
}

export default async function UrensturingPage() {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard");

  const asOf = resolveReportAsOf({
    today: amsterdamDateKey(),
    periodEnd: PROJECT_STEERING_CONFIG.reportPeriodEnd,
  });
  const cutoffEnd = reportCutoffEnd(asOf);

  const [budgetAllocations, hourEntries, users, workPackages, invoices, trainings, clients, therapistSurveyResponseCount] =
    await Promise.all([
      prisma.budgetAllocation.findMany({ include: { user: true }, orderBy: { category: "asc" } }),
      prisma.hourEntry.findMany({
        include: { user: true, therapist: true, workPackage: true, activity: true },
        orderBy: { date: "asc" },
      }),
      prisma.user.findMany({ select: { id: true, name: true, email: true } }),
      prisma.workPackage.findMany({
        include: { activities: { orderBy: { code: "asc" } } },
        orderBy: { code: "asc" },
      }),
      prisma.invoice.findMany({ where: { date: { lte: cutoffEnd } }, include: { workPackage: true }, orderBy: { date: "asc" } }),
      prisma.training.findMany({ where: { date: { lte: cutoffEnd } }, include: { attendees: true }, orderBy: { date: "asc" } }),
      prisma.client.findMany({ where: { startDate: { lte: cutoffEnd } }, orderBy: { startDate: "asc" } }),
      prisma.surveyResponse.count({ where: { submittedAt: { lte: cutoffEnd } } }),
    ]);
  const correctiveActions = buildCorrectiveActionPlan();
  const userByEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]));
  const categoryUserIds = Object.fromEntries(
    Object.entries(CATEGORY_USER_EMAILS)
      .map(([category, email]) => [category, userByEmail.get(email.toLowerCase())?.id])
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );

  const steeringHours = hourEntries.map((entry) => ({
    id: entry.id,
    userId: entry.userId,
    actorName: entry.therapist?.name || entry.user.name,
    date: entry.date.toISOString().slice(0, 10),
    hours: entry.hours,
    status: entry.status as HourStatus,
    workPackageCode: entry.workPackage.code,
    activityCode: entry.activity.code,
    activityName: entry.activity.name,
  }));

  const model = buildProjectSteeringModel({
    asOf,
    reportDate: PROJECT_STEERING_CONFIG.reportPeriodEnd,
    projectStart: PROJECT_STEERING_CONFIG.formalStart,
    projectEnd: PROJECT_STEERING_CONFIG.projectEnd,
    reportReferenceShare: PROJECT_STEERING_CONFIG.reportReferenceShare,
    categoryUserIds,
    budgets: budgetAllocations.map((allocation) => {
      const mappedUser =
        allocation.user ||
        userByEmail.get(CATEGORY_USER_EMAILS[allocation.category]?.toLowerCase() || "");
      return {
        id: allocation.id,
        category: allocation.category,
        label: mappedUser?.name || allocation.description || allocation.category,
        userId: allocation.userId,
        budgetHours: allocation.budgetHours,
        hourlyRate: allocation.hourlyRate,
        expectedWorkPackageCodes: EXPECTED_WORK_PACKAGES_BY_CATEGORY[allocation.category] || [],
      };
    }),
    hours: steeringHours,
    workPackagePhases: WORK_PACKAGE_PHASES,
  });

  const progressAssessments = assessWorkPackageProgress(
    asOf,
    Object.fromEntries(model.workPackages.map((row) => [row.code, row.reportableHours])),
  );

  const invoiceRows = invoices.map((invoice) => {
    const normalizedSupplier = invoice.supplier.toLocaleLowerCase("nl-NL");
    const suggestion = INVOICE_BUDGET_LINE_SUGGESTIONS.find((matcher) =>
      normalizedSupplier.includes(matcher.contains.toLocaleLowerCase("nl-NL")),
    );
    return {
      id: invoice.id,
      supplier: invoice.supplier,
      amountExVat: invoice.amountExVat,
      vatAmount: invoice.vatAmount,
      amountIncVat: invoice.amountIncVat,
      vatTreatment: invoice.vatTreatment,
      hasEvidence: hasValidInvoiceEvidence(invoice),
      suggestedBudgetLineId: suggestion?.budgetLineId || null,
      confirmedBudgetLineId: invoice.confirmedBudgetLineId,
      workPackageCode: invoice.workPackage.code,
    };
  });

  const categoryByUserId = new Map<string, string>();
  for (const allocation of budgetAllocations) {
    if (allocation.userId) categoryByUserId.set(allocation.userId, allocation.category);
  }
  for (const [category, userId] of Object.entries(categoryUserIds)) {
    if (!categoryByUserId.has(userId)) categoryByUserId.set(userId, category);
  }
  const financialHours = steeringHours
    .filter((entry) => entry.status === "APPROVED" && entry.date <= asOf)
    .map((entry) => ({
      id: entry.id,
      category: categoryByUserId.get(entry.userId) || null,
      actorName: entry.actorName,
      workPackageCode: entry.workPackageCode,
      hours: entry.hours,
    }));

  const financial = buildFinancialSteeringModel({
    participants: model.participants,
    hours: financialHours,
    budgetLines: APPROVED_BUDGET_LINES,
    invoices: invoiceRows,
    overheadRate: 0.15,
    approvedBudgetSourceStatus: PROJECT_STEERING_CONFIG.approvedBudgetSourceStatus,
    approvedBudgetTotalEuros: PROJECT_STEERING_CONFIG.approvedEligibleCostBaselineEuros,
  });

  const activityRows = workPackages.flatMap((workPackage) =>
    workPackage.activities.map((activity) => {
      const registered = model.activities.find((row) => row.code === activity.code);
      return {
        code: activity.code,
        name: activity.name,
        workPackageCode: workPackage.code,
        reportableHours: registered?.reportableHours || 0,
        unapprovedPastHours: registered?.unapprovedPastHours || 0,
        futureHours: registered?.futureHours || 0,
      };
    }),
  );

  const presentTrainingAttendees = trainings.reduce(
    (sum, training) => sum + training.attendees.filter((attendee) => attendee.present).length,
    0,
  );
  const trainingHourEntryCount = new Set(
    hourEntries
      .filter(
        (entry) =>
          entry.status === "APPROVED" &&
          isWithinReportCutoff(entry.date, asOf) &&
          entry.workPackage.code === "WP3" &&
          entry.therapistId !== null
      )
      .map((entry) => entry.therapistId)
  ).size;
  const reportQuestions = buildReportQuestions({
    steering: model,
    financial,
    clientCount: clients.length,
    trainingCount: trainings.length,
    presentTrainingAttendees,
    trainingHourEntryCount,
    vatRecoverable: false,
    therapistSurveyResponseCount,
  });
  const blockerQuestions = reportQuestions.filter((question) => question.priority === "BLOCKER");
  const questionsBySection = Array.from(
    reportQuestions.reduce((sections, question) => {
      const existing = sections.get(question.section) || [];
      existing.push(question);
      sections.set(question.section, existing);
      return sections;
    }, new Map<string, typeof reportQuestions>()),
  );

  const budgetedFinancialShare =
    model.totals.financialBudgetHours > 0
      ? model.totals.financialReportableHours / model.totals.financialBudgetHours
      : 0;

  return (
    <div className="space-y-8 pb-12 print:space-y-5">
      <section className="rounded-2xl bg-gradient-to-br from-slate-950 via-blue-950 to-primary-800 p-6 text-white shadow-lg print:border print:border-gray-300 print:bg-white print:text-black print:shadow-none">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-4xl">
            <div className="mb-3 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide">
              <span className="rounded-full bg-white/15 px-3 py-1">Hybride Begrip · Fy-fit</span>
              <span className="rounded-full bg-white/15 px-3 py-1">{PROJECT_STEERING_CONFIG.caseReference}</span>
              <span className={`rounded-full px-3 py-1 ${financial.isReportReady ? "bg-emerald-400/20 text-emerald-100" : "bg-amber-300/20 text-amber-100"}`}>
                {financial.isReportReady ? "Financieel rapportageklaar" : "Nog niet rapportageklaar"}
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Voortgangs- en financieel rapportagedossier</h1>
            <p className="mt-3 text-blue-100 print:text-gray-700">
              Peildatum {dateLabel(asOf)} · eerste verslagperiode {dateLabel(PROJECT_STEERING_CONFIG.reportPeriodStart)} t/m {dateLabel(PROJECT_STEERING_CONFIG.reportPeriodEnd)}.
            </p>
          </div>
          <ReportActions asOf={asOf} />
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card border-l-4 border-l-primary-600">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Rapportageklare uren</p>
          <p className="mt-2 text-3xl font-bold text-gray-950">{hours(model.totals.reportableHours)}</p>
          <p className="mt-1 text-sm text-gray-600">goedgekeurd en niet toekomstig</p>
        </div>
        <div className="card border-l-4 border-l-amber-500">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Datavragen / blockers</p>
          <p className="mt-2 text-3xl font-bold text-amber-800">{blockerQuestions.length}</p>
          <p className="mt-1 text-sm text-gray-600">eerst oplossen vóór indiening</p>
        </div>
        <div className="card border-l-4 border-l-emerald-600">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Verleende subsidie</p>
          <p className="mt-2 text-3xl font-bold text-gray-950">{euros(PROJECT_STEERING_CONFIG.approvedSubsidyEuros)}</p>
          <p className="mt-1 text-sm text-gray-600">beschikking 6 februari 2026</p>
        </div>
        <div className="card border-l-4 border-l-violet-500">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Goedgekeurde kostenbasis</p>
          <p className="mt-2 text-3xl font-bold text-gray-950">{euros(PROJECT_STEERING_CONFIG.approvedEligibleCostBaselineEuros)}</p>
          <p className="mt-1 text-sm text-gray-600">gereconstrueerd; officiële XLSX ontbreekt</p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="card border-blue-200 bg-blue-50">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Bronhiërarchie</p>
          <h2 className="mt-1 text-xl font-bold text-blue-950">Beschikking boven ingediende begroting</h2>
          <ul className="mt-4 space-y-2 text-sm text-blue-950/80">
            <li>• Ingediend: {euros(PROJECT_STEERING_CONFIG.submittedProjectCostsEuros)} projectkosten en indicatief {euros(PROJECT_STEERING_CONFIG.submittedIndicativeSubsidyEuros)} subsidie.</li>
            <li>• RVO corrigeerde de externe projectmanager naar 325 × €100 = €32.500.</li>
            <li>• De opgevoerde deelnemer Praktijkmanager en huisartsen (€920) is niet subsidiabel.</li>
            <li>• Verleend: maximaal {euros(PROJECT_STEERING_CONFIG.approvedSubsidyEuros)}; gereconstrueerde subsidiabele kostenbasis {euros(PROJECT_STEERING_CONFIG.approvedEligibleCostBaselineEuros)}.</li>
          </ul>
        </div>
        <div className="card border-amber-200 bg-amber-50">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">Planning</p>
          <h2 className="mt-1 text-xl font-bold text-amber-950">Formeel en feitelijk apart</h2>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-amber-900/70">Formele start</dt><dd className="font-semibold">{dateLabel(PROJECT_STEERING_CONFIG.formalStart)}</dd>
            <dt className="text-amber-900/70">Feitelijke start</dt><dd className="font-semibold">{dateLabel(PROJECT_STEERING_CONFIG.actualStart)}</dd>
            <dt className="text-amber-900/70">Eerste periode</dt><dd className="font-semibold">t/m {dateLabel(PROJECT_STEERING_CONFIG.reportPeriodEnd)}</dd>
            <dt className="text-amber-900/70">Projecteinde</dt><dd className="font-semibold">{dateLabel(PROJECT_STEERING_CONFIG.projectEnd)}</dd>
          </dl>
          <p className="mt-3 text-xs text-amber-800">De oorspronkelijke fasering blijft de vergelijkingsbasis zolang geen goedgekeurd wijzigingsbesluit is opgenomen.</p>
        </div>
      </section>

      <section>
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-700">Activiteitenplan × administratie</p>
          <h2 className="text-xl font-bold">Werkpakketten tegenover de ingediende fasering</h2>
          <p className="mt-1 text-sm text-gray-600">Uren ondersteunen de duiding, maar bewijzen niet dat een activiteit inhoudelijk is afgerond.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {model.workPackages.map((row) => {
            const signal = workPackageSignal(row.signal);
            return (
              <article key={row.code} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-xs font-bold text-primary-700">{row.code}</p><h3 className="font-semibold text-gray-950">{row.name}</h3></div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${signal.className}`}>{signal.label}</span>
                </div>
                <p className="mt-2 text-xs font-medium text-gray-500">Ingediend: {dateLabel(row.start)} – {dateLabel(row.end)}</p>
                <p className="mt-3 text-sm text-gray-700">{row.filedWorkDescription}</p>
                <div className="mt-4 grid grid-cols-4 gap-2 text-sm">
                  <div><p className="text-xs text-gray-500">Rapportabel</p><p className="font-bold">{hours(row.reportableHours)}</p></div>
                  <div><p className="text-xs text-gray-500">Niet akkoord</p><p className="font-bold">{hours(row.unapprovedPastHours)}</p></div>
                  <div><p className="text-xs text-gray-500">Toekomst</p><p className="font-bold text-violet-700">{hours(row.futureHours)}</p></div>
                  <div><p className="text-xs text-gray-500">Buiten fase</p><p className={`font-bold ${row.outsidePhaseHours > 0 ? "text-amber-700" : ""}`}>{hours(row.outsidePhaseHours)}</p></div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-700">Bevestigde inhoudelijke stand</p>
            <h2 className="text-xl font-bold">Wat klopt met het plan en wat moet worden ingehaald?</h2>
            <p className="mt-1 text-sm text-gray-600">Gebruikersbevestigingen blijven apart van uren- en impactclaims.</p>
          </div>
          <Link href="/urenplanning" className="btn-secondary text-sm">Open maandplanning →</Link>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {progressAssessments.map((row) => (
            <article key={row.code} className="card">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-xs font-bold text-primary-700">{row.code}</p><h3 className="font-semibold">{row.name}</h3></div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  row.status === "BEHIND" || row.status === "DELAYED"
                    ? "bg-amber-100 text-amber-800"
                    : row.status === "NOT_DUE"
                      ? "bg-violet-100 text-violet-800"
                      : "bg-emerald-100 text-emerald-800"
                }`}>
                  {row.status === "BEHIND" ? "Inhaalactie nodig" : row.status === "DELAYED" ? "Vertraagd" : row.status === "NOT_DUE" ? "Nog niet verschuldigd" : "In uitvoering"}
                </span>
              </div>
              <p className="mt-3 text-sm text-gray-800">{row.knownEvidence}</p>
              <p className="mt-2 text-xs text-gray-500">{row.explanation}</p>
            </article>
          ))}
        </div>
        <div className="mt-5 card overflow-hidden p-0">
          <div className="border-b border-gray-200 px-5 py-4">
            <h3 className="font-semibold">Corrigerende route augustus 2026 – augustus 2027</h3>
            <p className="text-sm text-gray-600">Planning en benodigd bewijs; geen vooraf geboekte realisatie.</p>
          </div>
          <div className="divide-y divide-gray-100">
            {correctiveActions.map((action) => (
              <div key={action.id} className="grid gap-2 px-5 py-4 md:grid-cols-[170px_1fr]">
                <div className="text-sm font-medium text-gray-600">{dateLabel(action.periodStart)} – {dateLabel(action.periodEnd)}</div>
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">{action.title}</h4>{action.workPackageCodes.map((code) => <span key={code} className="rounded bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700">{code}</span>)}</div>
                  <p className="mt-1 text-sm text-gray-700">{action.deliverable}</p>
                  <p className="mt-1 text-xs text-gray-500">Bewijs: {action.evidenceNeeded.join(" · ")}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-700">Administratieve onderverdeling</p>
          <h2 className="text-xl font-bold">Uren per activiteitcode</h2>
          <p className="mt-1 text-sm text-gray-600">Deze A-codes zijn de interne registratie-indeling. Het officiële Model D-verslag wordt op de zes ingediende werkpakketten opgebouwd.</p>
        </div>
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr><th className="px-4 py-3">Activiteit</th><th className="px-4 py-3">WP</th><th className="px-4 py-3 text-right">Rapportabel</th><th className="px-4 py-3 text-right">Niet akkoord</th><th className="px-4 py-3 text-right">Toekomst</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activityRows.map((row) => (
                  <tr key={row.code}>
                    <td className="px-4 py-3"><span className="font-semibold">{row.code}</span> · {row.name}</td>
                    <td className="px-4 py-3">{row.workPackageCode}</td>
                    <td className="px-4 py-3 text-right font-medium">{hours(row.reportableHours)}</td>
                    <td className="px-4 py-3 text-right">{hours(row.unapprovedPastHours)}</td>
                    <td className="px-4 py-3 text-right text-violet-700">{hours(row.futureHours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-700">Begrote urenrollen</p>
            <h2 className="text-xl font-bold">Wie registreerde wat ten opzichte van de urenbasis?</h2>
          </div>
          <p className="max-w-xl text-sm text-gray-600">De 50%-kolom is uitsluitend een lineaire referentie bij het eerste 12-maandsmoment; geen door RVO goedgekeurd tussendoel.</p>
        </div>
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr><th className="px-4 py-3">Rol / persoon</th><th className="px-4 py-3 text-right">Begroot</th><th className="px-4 py-3 text-right">Rapportabel</th><th className="px-4 py-3 text-right">50% referentie</th><th className="px-4 py-3 text-right">Verschil</th><th className="px-4 py-3 text-right">Toekomst</th><th className="px-4 py-3 text-right">Classificatievraag</th><th className="px-4 py-3 text-right">Resterend</th><th className="px-4 py-3">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {model.participants.map((row) => {
                  const signal = participantSignal(row.signal);
                  return (
                    <tr key={row.id} className="align-top">
                      <td className="px-4 py-3"><div className="font-semibold text-gray-900">{row.label}</div><div className="text-xs text-gray-500">{row.category} · {row.hourlyRate > 0 ? `${euros(row.hourlyRate)}/u` : "in-kind"}</div></td>
                      <td className="px-4 py-3 text-right font-medium">{hours(row.budgetHours)}</td>
                      <td className="px-4 py-3 text-right">{hours(row.reportableHours)}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{hours(row.referenceHours)}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${row.referenceVarianceHours < 0 ? "text-amber-700" : "text-blue-700"}`}>{row.referenceVarianceHours > 0 ? "+" : ""}{hours(row.referenceVarianceHours)}</td>
                      <td className="px-4 py-3 text-right text-violet-700">{hours(row.futureHours)}</td>
                      <td className={`px-4 py-3 text-right ${row.questionableWorkPackageHours > 0 ? "font-bold text-amber-700" : ""}`}>{hours(row.questionableWorkPackageHours)}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${row.remainingReportableHours < 0 ? "text-red-700" : ""}`}>{hours(row.remainingReportableHours)}</td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${signal.className}`}>{signal.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-500">Totaal financiële urenbasis {hours(model.totals.financialBudgetHours)} · rapportabel {hours(model.totals.financialReportableHours)} ({percentage(budgetedFinancialShare)}). De in-kind-basis van {hours(model.totals.inKindBudgetHours)} staat hier los van.</p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div>
          <div className="mb-3"><p className="text-xs font-semibold uppercase tracking-wider text-primary-700">Uitvoerderscontrole</p><h2 className="text-xl font-bold">Feitelijke personen per werkpakket</h2></div>
          <div className="card divide-y divide-gray-100 p-0">
            {model.actors.map((actor) => (
              <div key={`${actor.userId}-${actor.name}`} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-semibold text-gray-950">{actor.name}</p><p className="text-xs text-gray-500">{actor.budgetCategory || "Geen begrotingskoppeling"}</p></div>
                  <div className="text-right"><p className="font-bold">{hours(actor.reportableHours)}</p>{actor.futureHours > 0 && <p className="text-xs text-violet-700">+ {hours(actor.futureHours)} toekomst</p>}</div>
                </div>
                {actor.questionableWorkPackageHours > 0 && <p className="mt-2 text-xs font-semibold text-amber-700">{hours(actor.questionableWorkPackageHours)} vraagt rol-/WP-controle</p>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {actor.workPackages.map((workPackage) => <span key={workPackage.code} className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">{workPackage.code}: {hours(workPackage.reportableHours)}{workPackage.futureHours > 0 ? ` + ${hours(workPackage.futureHours)} toekomst` : ""}</span>)}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-3"><p className="text-xs font-semibold uppercase tracking-wider text-primary-700">RVO Model D</p><h2 className="text-xl font-bold">Tussenresultaten uit de administratie</h2></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="card"><p className="text-xs uppercase text-gray-500">Trainingen</p><p className="mt-2 text-2xl font-bold">{trainings.length}</p><p className="text-sm text-gray-600">{presentTrainingAttendees} aanwezig geregistreerd</p></div>
            <div className={`card ${clients.length === 0 ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}><p className="text-xs uppercase text-gray-500">Cliëntregistraties</p><p className="mt-2 text-2xl font-bold">{clients.length}</p><p className="text-sm text-gray-600">gebruikscijfers nog inhoudelijk duiden</p></div>
            <div className="card"><p className="text-xs uppercase text-gray-500">Uurregels</p><p className="mt-2 text-2xl font-bold">{hourEntries.length}</p><p className="text-sm text-gray-600">{hours(model.totals.reportableHours)} rapportageklaar</p></div>
            <div className="card"><p className="text-xs uppercase text-gray-500">Facturen</p><p className="mt-2 text-2xl font-bold">{invoices.length}</p><p className="text-sm text-gray-600">{euros(invoices.reduce((sum, invoice) => sum + invoice.amountExVat, 0))} ex. btw</p></div>
          </div>
          <div className="mt-4 card border-amber-200 bg-amber-50"><p className="text-sm font-semibold text-amber-950">Niet automatisch afleidbaar</p><p className="mt-2 text-sm text-amber-900/80">Inhoudelijke resultaten, procesinbedding, cliëntimpact, samenwerking en knelpunten moeten door Luuk/projectteam worden bevestigd. De app maakt daar geen groene bolletjes van; die zouden vooral cosmetisch projectmanagement zijn.</p></div>
        </div>
      </section>

      <section id="financieel" className="scroll-mt-20">
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-700">Financieel voortgangsverslag · RVO Model B</p>
          <h2 className="text-xl font-bold">Goedgekeurde begrotingsregels tegenover herleidbare realisatie</h2>
          <p className="mt-1 text-sm text-gray-600">Interne kosten komen uit goedgekeurde, logisch geclassificeerde uren. Externe kosten tellen pas definitief mee na bevestigde factuurkoppeling; urenwaarde en factuur worden nooit dubbel opgeteld.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="card"><p className="text-xs uppercase text-gray-500">Goedgekeurde kostenbasis</p><p className="mt-2 text-2xl font-bold">{euros(financial.totals.approvedBudgetEuros)}</p></div>
          <div className="card"><p className="text-xs uppercase text-gray-500">Minimaal herleidbaar</p><p className="mt-2 text-2xl font-bold">{euros(financial.totals.knownRealizedEuros)}</p><p className="text-xs text-gray-500">{percentage(financial.totals.knownRealizedShare)} · geen volledig actual</p></div>
          <div className="card"><p className="text-xs uppercase text-gray-500">Facturen voorstel</p><p className="mt-2 text-2xl font-bold text-amber-800">{euros(financial.totals.pendingInvoiceMappingEuros)}</p><p className="text-xs text-gray-500">nog niet definitief toegerekend</p></div>
          <div className={`card ${financial.isReportReady ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}><p className="text-xs uppercase text-gray-500">Geconsolideerd actual</p><p className="mt-2 text-2xl font-bold">{financial.totals.consolidatedRealizedEuros === null ? "Geblokkeerd" : euros(financial.totals.consolidatedRealizedEuros)}</p><p className="text-xs text-gray-500">{financial.blockers.length} financiële blocker(s)</p></div>
        </div>
        {financial.totals.pendingVatEuros > 0 && <p className="mt-3 text-sm font-semibold text-amber-800">Btw nog te toetsen: {euros(financial.totals.pendingVatEuros)}. Dit bedrag is nog niet in het herleidbare actual opgenomen.</p>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {financial.sections.map((section) => (
            <div key={section.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{section.label}</p>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div><p className="text-xs text-gray-500">Verleend</p><p className="font-bold text-gray-950">{euros(section.budgetEuros)}</p></div>
                <div className="text-right"><p className="text-xs text-gray-500">Herleidbaar</p><p className="font-bold text-primary-800">{euros(section.knownRealizedEuros)}</p></div>
              </div>
              {section.pendingInvoiceMappingEuros > 0 && <p className="mt-2 text-xs font-semibold text-amber-700">{euros(section.pendingInvoiceMappingEuros)} factuurvoorstel</p>}
            </div>
          ))}
        </div>
        <div className="mt-4 card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr><th className="px-4 py-3">Begrotingsregel</th><th className="px-4 py-3 text-right">Begroot</th><th className="px-4 py-3 text-right">Rapportklare uren</th><th className="px-4 py-3 text-right">Classificatievraag</th><th className="px-4 py-3 text-right">Urenwaarde indicatief</th><th className="px-4 py-3 text-right">Factuur bevestigd</th><th className="px-4 py-3 text-right">Factuur voorstel</th><th className="px-4 py-3 text-right">Herleidbaar actual</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {financial.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3"><p className="font-semibold">{row.label}</p><p className="text-xs text-gray-500">{financial.sections.find((section) => section.id === row.rvoSection)?.label || "Niet uitgesplitst"} · {row.costType === "INTERNAL_LABOUR" ? "Intern personeel" : row.costType === "EXTERNAL_LABOUR" ? "Kosten derden" : row.costType === "OVERHEAD" ? "15% opslag" : "Overige kosten"}</p></td>
                    <td className="px-4 py-3 text-right font-medium">{euros(row.budgetEuros)}</td>
                    <td className="px-4 py-3 text-right">{row.budgetHours ? hours(row.reportReadyHours) : "—"}</td>
                    <td className={`px-4 py-3 text-right ${row.classificationPendingHours > 0 ? "font-bold text-amber-700" : ""}`}>{row.budgetHours ? hours(row.classificationPendingHours) : "—"}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{row.hourlyRate ? euros(row.indicativeHoursValueEuros) : "—"}</td>
                    <td className="px-4 py-3 text-right">{euros(row.confirmedInvoiceEuros)}</td>
                    <td className={`px-4 py-3 text-right ${row.pendingInvoiceMappingEuros > 0 ? "font-semibold text-amber-700" : ""}`}>{euros(row.pendingInvoiceMappingEuros)}</td>
                    <td className="px-4 py-3 text-right font-bold">{euros(row.knownRealizedEuros)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {financial.unallocatedHours.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-5">
            <h3 className="font-semibold text-amber-950">Uren zonder passende verleende Model-B-regel</h3>
            <p className="mt-1 text-sm text-amber-900/80">Deze uren blijven zichtbaar, maar tellen niet mee als financieel gerealiseerd totdat de kostentoerekening formeel is bevestigd.</p>
            <ul className="mt-3 space-y-2 text-sm text-amber-950">
              {financial.unallocatedHours.map((row) => (
                <li key={row.category} className="flex flex-wrap justify-between gap-2 rounded-lg bg-white/70 px-3 py-2">
                  <span className="font-medium">{row.category}</span>
                  <span>{hours(row.hours)} · indicatief {euros(row.indicativeEuros)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!financial.isReportReady && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-5">
            <h3 className="font-semibold text-red-950">Waarom het financiële totaal bewust niet wordt getoond</h3>
            <ul className="mt-3 grid gap-2 text-sm text-red-900 lg:grid-cols-2">
              {financial.blockers.map((blocker) => <li key={blocker}>• {blockerLabel(blocker)}</li>)}
            </ul>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3"><p className="text-xs font-semibold uppercase tracking-wider text-primary-700">Factuurbewijs</p><h2 className="text-xl font-bold">Begrotingskoppeling en btw-behandeling bevestigen</h2><p className="mt-1 text-sm text-gray-600">Elke bevestiging bewaart before/after, reden, actor en tijdstip in het auditspoor.</p></div>
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1250px] text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">Datum</th><th className="px-4 py-3">Leverancier</th><th className="px-4 py-3">WP</th><th className="px-4 py-3 text-right">Bedragen</th><th className="px-4 py-3">Bewijs</th><th className="px-4 py-3">Voorstel / status</th><th className="px-4 py-3">Auditbare bevestiging</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((invoice) => {
                  const mapped = invoiceRows.find((row) => row.id === invoice.id);
                  const suggestedLine = APPROVED_BUDGET_LINES.find((row) => row.id === mapped?.suggestedBudgetLineId);
                  const confirmedLine = APPROVED_BUDGET_LINES.find((row) => row.id === invoice.confirmedBudgetLineId);
                  const options = APPROVED_BUDGET_LINES.filter((row) =>
                    (row.costType === "EXTERNAL_LABOUR" || row.costType === "OTHER") &&
                    (!row.eligibleWorkPackageCodes?.length || row.eligibleWorkPackageCodes.includes(invoice.workPackage.code)),
                  ).map((row) => ({ id: row.id, label: row.label }));
                  return <tr key={invoice.id} className="align-top"><td className="px-4 py-3">{dateLabel(invoice.date.toISOString().slice(0, 10))}</td><td className="px-4 py-3 font-medium">{invoice.supplier}<span className="block text-xs text-gray-500">{invoice.invoiceNumber}</span></td><td className="px-4 py-3">{invoice.workPackage.code}</td><td className="px-4 py-3 text-right">{euros(invoice.amountExVat)} ex.<span className="block text-xs text-gray-500">{euros(invoice.vatAmount)} btw</span></td><td className="px-4 py-3">{mapped?.hasEvidence ? "Aanwezig" : "Ontbreekt"}</td><td className="px-4 py-3">{confirmedLine ? <><span className="font-semibold text-emerald-800">Bevestigd</span><span className="block text-xs">{confirmedLine.label}</span></> : <><span className="font-semibold text-amber-800">Te bevestigen</span><span className="block text-xs">{suggestedLine?.label || "Geen voorstel"}</span></>}</td><td className="px-4 py-3"><InvoiceClassificationForm invoiceId={invoice.id} budgetLines={options} suggestedBudgetLineId={mapped?.suggestedBudgetLineId} confirmedBudgetLineId={invoice.confirmedBudgetLineId} currentVatTreatment={invoice.vatTreatment} currentReason={invoice.classificationReason} /></td></tr>;
                })}
                {invoices.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Nog geen facturen geregistreerd.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-start gap-3"><span className="text-2xl">?</span><div><p className="text-xs font-semibold uppercase tracking-wider text-amber-800">RVO-dossiercheck</p><h2 className="text-xl font-bold text-amber-950">Gerichte vragen voor het voortgangsverslag</h2><p className="mt-1 text-sm text-amber-800">Eerst staan blockers en bronvragen; daarna alle verplichte inhoudelijke onderdelen uit Model D.</p></div></div>
        <div className="mt-5 space-y-4">
          {questionsBySection.map(([section, questions]) => (
            <details key={section} open={questions.some((question) => question.priority === "BLOCKER")} className="rounded-xl border border-amber-200 bg-white">
              <summary className="cursor-pointer px-4 py-3 font-semibold text-gray-900">{section} <span className="ml-2 text-xs font-normal text-gray-500">{questions.length} vragen</span></summary>
              <ol className="border-t border-amber-100 p-4 space-y-3">
                {questions.map((question, index) => (
                  <li key={question.id} className={`rounded-lg border p-4 text-sm ${question.priority === "BLOCKER" ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50"}`}>
                    <div className="flex items-start gap-3"><span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${question.priority === "BLOCKER" ? "bg-red-100 text-red-800" : "bg-gray-200 text-gray-700"}`}>{index + 1}</span><div><p className="font-medium text-gray-900">{question.question}</p>{question.knownEvidence && <p className="mt-2 text-gray-700"><strong>Al bekend:</strong> {question.knownEvidence}</p>}<p className="mt-1 text-xs text-gray-500">{question.reason}</p></div></div>
                  </li>
                ))}
              </ol>
            </details>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2"><h2 className="font-semibold">Bronnen en herleidbaarheid</h2><ul className="mt-3 space-y-2 text-sm text-gray-600"><li>• {SOURCE_NOTES.decision}</li><li>• {SOURCE_NOTES.approvedBudget}</li><li>• {SOURCE_NOTES.submittedBudget}</li><li>• {SOURCE_NOTES.schedule}</li><li>• {SOURCE_NOTES.reportTemplate}</li><li>• Live Prisma: {hourEntries.length} uurregels, {invoices.length} facturen, {trainings.length} trainingen, {clients.length} cliëntregistraties.</li></ul></div>
        <div className={`card ${model.totals.unapprovedPastHours > 0 || model.totals.futureHours > 0 ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}><h2 className="font-semibold">Datakwaliteit uren</h2><p className="mt-3 text-2xl font-bold">{hours(model.totals.reportableHours)}</p><p className="text-sm text-gray-600">rapportageklaar</p><p className="mt-2 text-xs text-gray-500">Niet goedgekeurd: {hours(model.totals.unapprovedPastHours)} · Toekomstig: {hours(model.totals.futureHours)}</p></div>
      </section>

      <div className="flex flex-wrap gap-3 print:hidden"><Link href={`/api/export?type=hours&scope=report&asOf=${asOf}`} className="btn-primary">Download uren-CSV t/m peildatum</Link><Link href={`/api/export?type=invoices&scope=report&asOf=${asOf}`} className="btn-secondary">Download facturen-CSV t/m peildatum</Link><Link href="/export" className="btn-secondary">Alle administratieve exports</Link></div>
    </div>
  );
}
