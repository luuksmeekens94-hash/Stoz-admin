"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { PlannedHourActor } from "@/components/PlannedHourMaterializer";
import type { ReviewedPlanningHourRow } from "@/components/ReviewedPlanningHours";

export interface PastPlanningRow extends ReviewedPlanningHourRow {
  monthKey: string;
  suggestedActorKey: string;
}

function formatHours(value: number) {
  return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(value)} uur`;
}

export default function PastPlanningReconciliation({
  rows,
  actors,
}: {
  rows: PastPlanningRow[];
  actors: PlannedHourActor[];
}) {
  const router = useRouter();
  const months = useMemo(() => {
    const grouped = new Map<string, PastPlanningRow[]>();
    for (const row of rows) grouped.set(row.monthKey, [...(grouped.get(row.monthKey) || []), row]);
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);
  const [actorKeys, setActorKeys] = useState<Record<string, string>>(
    Object.fromEntries(rows.map((row) => [row.id, row.suggestedActorKey])),
  );
  const [sources, setSources] = useState<Record<string, string>>({});
  const [confirmations, setConfirmations] = useState<Record<string, boolean>>({});
  const [savingMonth, setSavingMonth] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (months.length === 0) return null;

  async function reconcileMonth(monthKey: string, monthLabel: string, monthRows: PastPlanningRow[]) {
    const sourceReference = (sources[monthKey] || "").trim();
    const selectedActors = monthRows.map((row) => actors.find((actor) => actor.key === actorKeys[row.id]));
    if (sourceReference.length < 20 || !confirmations[monthKey] || selectedActors.some((actor) => !actor)) return;

    setSavingMonth(monthKey);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/hours/planning/months/${monthKey}/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceReference,
          performedConfirmation: true,
          rows: monthRows.map((row, index) => ({
            forecastEntryId: row.id,
            userId: selectedActors[index]!.userId,
            therapistId: selectedActors[index]!.therapistId,
          })),
        }),
      });
      const payload = await response.json().catch(() => null) as { error?: string; approvedCount?: number } | null;
      if (!response.ok || typeof payload?.approvedCount !== "number") {
        setError(payload?.error || `De uren van ${monthLabel} konden niet worden goedgekeurd.`);
        return;
      }
      setSuccess(`${payload.approvedCount} urenregels van ${monthLabel} zijn als werkelijk uitgevoerd geregistreerd en goedgekeurd.`);
      router.refresh();
    } catch {
      setError(`Verbindingsfout bij het verwerken van ${monthLabel}.`);
    } finally {
      setSavingMonth("");
    }
  }

  return (
    <section className="rounded-xl border-2 border-amber-300 bg-amber-50 p-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Eerst afhandelen</p>
        <h2 className="mt-1 text-2xl font-bold text-amber-950">Zijn de geplande uren echt gemaakt?</h2>
        <p className="mt-2 max-w-4xl text-sm text-amber-950">
          Controleer per afgelopen maand datum, uitvoerder, werkzaamheden en uren. Klopt alles, dan registreer en keur je de hele maand in één keer goed. Wijkt één regel af, pas alleen die regel apart aan.
        </p>
      </div>

      {error && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {success && <div role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>}

      <div className="mt-5 space-y-5">
        {months.map(([monthKey, monthRows]) => {
          const monthLabel = monthRows[0].monthLabel;
          const total = monthRows.reduce((sum, row) => sum + row.plannedHours, 0);
          const allActorsSelected = monthRows.every((row) => actors.some((actor) => actor.key === actorKeys[row.id]));
          const canSubmit = allActorsSelected && (sources[monthKey] || "").trim().length >= 20 && confirmations[monthKey] && savingMonth !== monthKey;
          return (
            <article key={monthKey} className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100 bg-amber-50 px-4 py-3">
                <div>
                  <h3 className="text-lg font-bold capitalize text-gray-950">{monthLabel}</h3>
                  <p className="text-sm text-gray-600">{monthRows.length} openstaande regels · {formatHours(total)}</p>
                </div>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">Nog geen realisatie</span>
              </div>

              <div className="divide-y divide-gray-100">
                {monthRows.map((row) => (
                  <div key={row.id} className="grid gap-3 p-4 lg:grid-cols-[110px_1fr_230px_80px_auto] lg:items-center">
                    <div className="text-sm font-medium">{new Date(`${row.plannedDate}T00:00:00.000Z`).toLocaleDateString("nl-NL", { timeZone: "UTC" })}</div>
                    <div>
                      <p className="font-semibold">{row.workPackageCode}/{row.activityCode} · {row.activityName}</p>
                      <p className="text-xs text-gray-500">Gepland voor {row.executorName}</p>
                      {row.note && <p className="mt-1 text-xs text-gray-600">{row.note}</p>}
                    </div>
                    <div>
                      <label className="sr-only" htmlFor={`actor-${row.id}`}>Werkelijke uitvoerder voor {row.executorName}</label>
                      <select
                        id={`actor-${row.id}`}
                        className="input py-2 text-sm"
                        value={actorKeys[row.id] || ""}
                        onChange={(event) => setActorKeys((current) => ({ ...current, [row.id]: event.target.value }))}
                      >
                        <option value="">Kies werkelijke uitvoerder…</option>
                        {actors.map((actor) => <option key={actor.key} value={actor.key}>{actor.name} — {actor.roleLabel}</option>)}
                      </select>
                    </div>
                    <div className="text-right font-bold">{formatHours(row.plannedHours)}</div>
                    <Link href={`/uren/nieuw?forecastEntryId=${encodeURIComponent(row.id)}`} className="text-sm font-semibold text-primary-700 hover:underline">
                      Afwijking aanpassen
                    </Link>
                  </div>
                ))}
              </div>

              <div className="space-y-3 border-t border-amber-100 bg-gray-50 p-4">
                <div>
                  <label htmlFor={`source-${monthKey}`} className="label">Bron of onderbouwing {monthLabel}</label>
                  <textarea
                    id={`source-${monthKey}`}
                    className="input"
                    rows={2}
                    minLength={20}
                    maxLength={2000}
                    placeholder="Bijv. agenda, overlegnotities en opgeleverde documenten van deze maand"
                    value={sources[monthKey] || ""}
                    onChange={(event) => setSources((current) => ({ ...current, [monthKey]: event.target.value }))}
                  />
                </div>
                <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-white p-3 text-sm text-amber-950">
                  <input
                    type="checkbox"
                    className="mt-1 rounded"
                    aria-label={`Alle geselecteerde werkzaamheden van ${monthLabel} zijn daadwerkelijk uitgevoerd`}
                    checked={Boolean(confirmations[monthKey])}
                    onChange={(event) => setConfirmations((current) => ({ ...current, [monthKey]: event.target.checked }))}
                  />
                  <span>Ik bevestig dat alle geselecteerde werkzaamheden daadwerkelijk zijn uitgevoerd op de getoonde datum, door de gekozen uitvoerder en voor het getoonde aantal uren.</span>
                </label>
                {!allActorsSelected && <p className="text-sm font-medium text-amber-800">Kies eerst voor iedere regel de werkelijke uitvoerder.</p>}
                <button
                  type="button"
                  className="btn-success w-full sm:w-auto"
                  disabled={!canSubmit}
                  onClick={() => reconcileMonth(monthKey, monthLabel, monthRows)}
                  aria-label={`${monthLabel} registreren en goedkeuren`}
                >
                  {savingMonth === monthKey ? "Registreren en goedkeuren…" : `Ja, ${monthLabel} registreren en goedkeuren`}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
