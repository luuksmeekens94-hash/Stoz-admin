"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import type { MonthlyPlanningApprovalMonth } from "@/components/MonthlyPlanningApprovalBoard";
import MonthlyPlanningApprovalBoard from "@/components/MonthlyPlanningApprovalBoard";
import type {
  InterimCatchUpProposal,
  InterimComparisonRow,
  buildInterimHoursSteering,
} from "@/lib/interim-hour-steering";

type InterimSteering = ReturnType<typeof buildInterimHoursSteering>;

function formatHours(value: number) {
  return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(value)} uur`;
}

function differenceLabel(row: Pick<InterimComparisonRow, "differenceHours" | "state">) {
  if (row.state === "TO_ADD") return `${formatHours(row.differenceHours)} minder`;
  if (row.state === "ABOVE_TARGET") return `${formatHours(Math.abs(row.differenceHours))} meer`;
  return "op doel";
}

function stateClass(state: InterimComparisonRow["state"]) {
  if (state === "TO_ADD") return "bg-amber-100 text-amber-900";
  if (state === "ABOVE_TARGET") return "bg-blue-100 text-blue-900";
  return "bg-emerald-100 text-emerald-900";
}

function ComparisonTable({ rows }: { rows: InterimComparisonRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="px-4 py-3">Functie / titel</th>
            <th className="px-4 py-3 text-right">Totale begroting</th>
            <th className="px-4 py-3 text-right">Doel nu</th>
            <th className="px-4 py-3 text-right">Geregistreerd</th>
            <th className="px-4 py-3 text-right">Verschil</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-gray-100 last:border-0">
              <td className="px-4 py-3 font-medium text-gray-950">{row.label}</td>
              <td className="px-4 py-3 text-right text-gray-600">{formatHours(row.budgetHours)}</td>
              <td className="px-4 py-3 text-right font-semibold">{formatHours(row.targetHours)}</td>
              <td className="px-4 py-3 text-right font-semibold">{formatHours(row.currentHours)}</td>
              <td className="px-4 py-3 text-right">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${stateClass(row.state)}`}>
                  {differenceLabel(row)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProposalList({ proposals }: { proposals: InterimCatchUpProposal[] }) {
  return (
    <div className="divide-y divide-amber-100 rounded-xl border border-amber-200 bg-white">
      {proposals.map((proposal) => (
        <div key={`${proposal.budgetLineKey}-${proposal.workPackageCode}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
          <div>
            <p className="font-semibold text-gray-950">{proposal.title}</p>
            <p className="text-gray-600">{proposal.workPackageCode} · nu {formatHours(proposal.currentHours)} · doel {formatHours(proposal.targetHours)}</p>
          </div>
          <p className="font-bold text-amber-900">+ {formatHours(proposal.proposedHours)}</p>
        </div>
      ))}
    </div>
  );
}

export default function InterimHoursDashboard({
  asOf,
  steering,
  preparedProposalKeys,
  months,
}: {
  asOf: string;
  steering: InterimSteering;
  preparedProposalKeys: string[];
  months: MonthlyPlanningApprovalMonth[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const pendingProposals = steering.proposals.filter(
    (proposal) => !preparedProposalKeys.includes(`${proposal.budgetLineKey}|${proposal.workPackageCode}`),
  );
  const pendingHours = pendingProposals.reduce((sum, proposal) => sum + proposal.proposedHours, 0);
  const netVarianceText = steering.totals.netVarianceHours > 0
    ? `${formatHours(steering.totals.netVarianceHours)} boven de doelstand`
    : steering.totals.netVarianceHours < 0
      ? `${formatHours(Math.abs(steering.totals.netVarianceHours))} onder de doelstand`
      : "precies op de doelstand";

  async function prepareAll() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/hours/reconstruction/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: globalThis.crypto.randomUUID(),
          asOf,
          proposals: pendingProposals,
        }),
      });
      const payload = await response.json().catch(() => null) as {
        error?: string;
        proposalHours?: number;
        proposalCount?: number;
      } | null;
      if (!response.ok) {
        setError(payload?.error || "De aanvullingen konden niet worden klaargezet.");
        return;
      }
      if (!payload || typeof payload.proposalHours !== "number" || typeof payload.proposalCount !== "number") {
        setError("De aanvullingen konden niet worden klaargezet.");
        return;
      }
      setSuccess(`${formatHours(payload.proposalHours)} verdeeld over ${payload.proposalCount} aanvullingen staat klaar.`);
      router.refresh();
    } catch {
      setError("Verbindingsfout bij het klaarzetten van de aanvullingen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary-700">Urensturing Hybride Begrip</p>
        <h1 className="mt-1 text-3xl font-bold text-gray-950">Wat hoort er nu te staan, wat staat er al en wat volgt per maand?</h1>
        <p className="mt-2 max-w-4xl text-gray-600">
          Eén overzicht voor precies drie taken. Alle geregistreerde statussen tellen mee; plannen vanaf nu blijven apart van werkelijk geboekte uren.
        </p>
      </header>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Stap 1</p>
          <h2 className="text-2xl font-bold text-gray-950">1. Realistische stand halverwege</h2>
          <p className="mt-1 max-w-4xl text-gray-600">
            Ingeschat op basis van de projectfasen: ontwikkeling is voorbelast; implementatie, verspreiding, monitoring en borging krijgen juist meer uren in de tweede helft. Dit is dus geen rechte 50%-lijn.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card border-l-4 border-l-blue-700">
            <p className="text-sm text-gray-500">Totale urenbegroting</p>
            <p className="mt-1 text-3xl font-bold">{formatHours(steering.totals.budgetHours)}</p>
          </div>
          <div className="card border-l-4 border-l-emerald-600">
            <p className="text-sm text-gray-500">Realistisch doel nu</p>
            <p className="mt-1 text-3xl font-bold text-emerald-800">{formatHours(steering.totals.targetHours)}</p>
            <p className="mt-1 text-xs text-gray-500">48,9% van de totale begroting</p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-500">Geregistreerd in alle statussen</p>
            <p className="mt-1 text-3xl font-bold">{formatHours(steering.totals.currentHours)}</p>
            <p className="mt-1 text-xs text-gray-500">netto {netVarianceText}</p>
          </div>
        </div>
        <ComparisonTable rows={steering.titles} />
        <details className="rounded-xl border border-gray-200 bg-white p-4">
          <summary className="cursor-pointer font-semibold text-gray-800">Waarom deze verdeling?</summary>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {steering.targets.map((target) => (
              <div key={`${target.budgetLineKey}-${target.workPackageCode}`} className="rounded-lg bg-gray-50 p-3 text-sm">
                <p className="font-semibold">{target.title} · {target.workPackageCode} · {formatHours(target.targetHours)}</p>
                <p className="mt-1 text-gray-600">{target.rationale}</p>
              </div>
            ))}
          </div>
        </details>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Stap 2</p>
          <h2 className="text-2xl font-bold text-gray-950">2. Huidige registratie naast de doelstand</h2>
          <p className="mt-1 max-w-4xl text-gray-600">
            Het totaal ligt al boven het doel, maar enkele functies en werkpakketten ontbreken nog. Een overschrijding elders verstopt die gaten niet.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-[1fr_1.1fr]">
          <div className="card">
            <h3 className="text-lg font-semibold">Per werkpakket</h3>
            <div className="mt-3 space-y-2">
              {steering.workPackages.map((row) => (
                <div key={row.code} className="grid grid-cols-[1fr_auto] gap-3 rounded-lg border border-gray-100 p-3 text-sm">
                  <div>
                    <p className="font-medium">{row.code} · {row.label}</p>
                    <p className="text-xs text-gray-500">doel {formatHours(row.targetHours)} · geregistreerd {formatHours(row.currentHours)}</p>
                  </div>
                  <span className={`self-center rounded-full px-2.5 py-1 text-xs font-semibold ${stateClass(row.state)}`}>
                    {differenceLabel(row)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="card border-amber-200 bg-amber-50/50">
            <h3 className="text-lg font-semibold text-amber-950">Aanvullen waar nodig</h3>
            <p className="mt-1 text-sm text-amber-900">
              Nog {formatHours(pendingHours)} verdeeld over {pendingProposals.length} functie/werkpakket-combinaties. De knop maakt alleen controleerbare voorstellen; nog geen urenboekingen.
            </p>
            {pendingProposals.length > 0 ? (
              <>
                <div className="mt-4"><ProposalList proposals={pendingProposals} /></div>
                <button
                  type="button"
                  className="btn-primary mt-4 w-full"
                  disabled={saving}
                  onClick={prepareAll}
                  aria-label={`Alle ${pendingProposals.length} aanvullingen klaarzetten`}
                >
                  {saving ? "Klaarzetten…" : `Alle ${pendingProposals.length} aanvullingen klaarzetten`}
                </button>
              </>
            ) : (
              <div className="mt-4 rounded-lg bg-emerald-100 p-4 text-emerald-950">
                <p className="font-semibold">Alle benodigde aanvullingen staan klaar.</p>
                <p className="mt-1 text-sm">Vul nu per voorstel de werkelijk gewerkte datum, uitvoerder en activiteit in.</p>
                <Link href="/uren/reconstructie" className="mt-3 inline-flex font-semibold text-emerald-900 underline underline-offset-2">
                  Datums en uitvoerders invullen →
                </Link>
              </div>
            )}
            {error && <div role="alert" className="mt-3 rounded-lg bg-red-100 p-3 text-sm text-red-800">{error}</div>}
            {success && <div role="status" className="mt-3 rounded-lg bg-emerald-100 p-3 text-sm text-emerald-900">{success}</div>}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Stap 3</p>
          <h2 className="text-2xl font-bold text-gray-950">3. Uren vanaf nu per maand</h2>
          <p className="mt-1 max-w-4xl text-gray-600">
            Vanaf de huidige maand staat de verwachte inzet per functie klaar. Controleer een maand en keur die met één knop goed; dit blijft planning en wordt nooit automatisch realisatie.
          </p>
        </div>
        {months.length > 0 ? (
          <MonthlyPlanningApprovalBoard months={months} compact />
        ) : (
          <div className="card text-gray-600">Er staan geen toekomstige planmaanden klaar.</div>
        )}
      </section>
    </div>
  );
}
