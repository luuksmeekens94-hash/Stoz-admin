"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export interface InterimMaterializationActor {
  key: string;
  userId: string;
  therapistId: string | null;
  name: string;
  roleLabel: string;
}

export interface InterimMaterializationProposal {
  id: string;
  title: string;
  workPackageCode: string;
  activityCode: string;
  activityName: string;
  targetHours: number;
  currentHours: number;
  remainingHours: number;
  actors: InterimMaterializationActor[];
}

function formatHours(value: number) {
  return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(value);
}

export default function InterimProposalMaterializer({
  asOf,
  proposals,
}: {
  asOf: string;
  proposals: InterimMaterializationProposal[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState("");
  const [actorKey, setActorKey] = useState("");
  const [date, setDate] = useState("");
  const [hours, setHours] = useState("");
  const [description, setDescription] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [requestId, setRequestId] = useState(() => globalThis.crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selected = proposals.find((proposal) => proposal.id === selectedId) || null;
  const actor = selected?.actors.find((candidate) => candidate.key === actorKey) || null;
  const numericHours = Number(hours);
  const canSubmit = Boolean(
    selected && actor && date && numericHours > 0 && numericHours <= selected.remainingHours &&
    Number.isInteger(numericHours * 4) && description.trim().length >= 10 &&
    sourceReference.trim().length >= 20 && confirmed && !saving,
  );

  function selectProposal(proposal: InterimMaterializationProposal) {
    setSelectedId(proposal.id);
    setActorKey("");
    setDate("");
    setHours(String(Math.min(24, proposal.remainingHours)));
    setDescription("");
    setSourceReference("");
    setConfirmed(false);
    setRequestId(globalThis.crypto.randomUUID());
    setError("");
    setSuccess("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected || !actor) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/hours/reconstruction/proposals/${selected.id}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          userId: actor.userId,
          therapistId: actor.therapistId,
          date,
          hours: numericHours,
          description,
          sourceReference,
          performedConfirmation: confirmed,
        }),
      });
      const payload = await response.json().catch(() => null) as {
        error?: string;
        remainingHours?: number;
      } | null;
      if (!response.ok) {
        setError(payload?.error || "De conceptregistratie kon niet worden aangemaakt.");
        return;
      }
      if (!payload || typeof payload.remainingHours !== "number") {
        setError("De conceptregistratie kon niet worden aangemaakt.");
        return;
      }
      setSuccess(`Concept van ${formatHours(numericHours)} uur aangemaakt. Resterend voorstel: ${formatHours(payload.remainingHours)} uur.`);
      setRequestId(globalThis.crypto.randomUUID());
      setDate("");
      setHours("");
      setDescription("");
      setSourceReference("");
      setConfirmed(false);
      router.refresh();
    } catch {
      setError("Verbindingsfout bij het aanmaken van de conceptregistratie.");
    } finally {
      setSaving(false);
    }
  }

  if (proposals.length === 0) {
    return <div className="card text-gray-600">Er staan geen open aanvullingen meer klaar.</div>;
  }

  return (
    <div className="space-y-5">
      <section className="card border-amber-200 bg-amber-50/50">
        <h2 className="text-lg font-semibold text-amber-950">Klaargezette aanvullingen</h2>
        <p className="mt-1 text-sm text-amber-900">
          Kies een voorstel en vul de echte uitvoeringsgegevens in. Een voorstel is nog geen bewijs dat het werk is uitgevoerd.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {proposals.map((proposal) => (
            <article key={proposal.id} className="rounded-xl border border-amber-200 bg-white p-4">
              <h3 className="font-semibold">{proposal.title}</h3>
              <p className="mt-1 text-sm text-gray-600">
                {proposal.workPackageCode}.{proposal.activityCode} · {proposal.activityName}
              </p>
              <p className="mt-2 text-sm">Nog <strong>{formatHours(proposal.remainingHours)} uur</strong> van doel {formatHours(proposal.targetHours)} uur.</p>
              <button type="button" className="btn-primary mt-3" onClick={() => selectProposal(proposal)} aria-label={`${proposal.title} invullen`}>
                Datum en uitvoerder invullen
              </button>
            </article>
          ))}
        </div>
      </section>

      {selected && (
        <section className="card">
          <h2 className="text-lg font-semibold">Conceptregel voor {selected.title}</h2>
          <form className="mt-4 space-y-4" onSubmit={submit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="label" htmlFor="proposal-actor">Uitvoerder</label>
                <select id="proposal-actor" className="input" value={actorKey} onChange={(event) => setActorKey(event.target.value)} required>
                  <option value="">Selecteer uitvoerder...</option>
                  {selected.actors.map((candidate) => <option key={candidate.key} value={candidate.key}>{candidate.name} — {candidate.roleLabel}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="proposal-date">Werkelijke uitvoeringsdatum</label>
                <input id="proposal-date" className="input" type="date" min="2025-09-01" max={asOf} value={date} onChange={(event) => setDate(event.target.value)} required />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="proposal-hours">Uren in deze conceptregel</label>
              <input id="proposal-hours" className="input" type="number" min="0.25" max={Math.min(24, selected.remainingHours)} step="0.25" value={hours} onChange={(event) => setHours(event.target.value)} required />
              <p className="mt-1 text-xs text-gray-500">Maximaal {formatHours(Math.min(24, selected.remainingHours))} uur per regel.</p>
            </div>
            <div>
              <label className="label" htmlFor="proposal-description">Werkzaamheden</label>
              <textarea id="proposal-description" className="input" rows={3} minLength={10} maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} required />
            </div>
            <div>
              <label className="label" htmlFor="proposal-source">Bron of onderbouwing</label>
              <textarea id="proposal-source" className="input" rows={3} minLength={20} maxLength={2000} value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} required />
              <p className="mt-1 text-xs text-gray-500">Geen cliëntnamen, contactgegevens of gezondheidsgegevens opnemen.</p>
            </div>
            <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-4 text-sm">
              <input type="checkbox" className="mt-1 rounded" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
              <span>Ik bevestig dat deze concrete werkzaamheden daadwerkelijk op de ingevulde datum zijn uitgevoerd.</span>
            </label>
            {error && <div role="alert" className="rounded-lg bg-red-100 p-3 text-sm text-red-800">{error}</div>}
            {success && <div role="status" className="rounded-lg bg-emerald-100 p-3 text-sm text-emerald-900">{success}</div>}
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className="btn-primary" disabled={!canSubmit}>{saving ? "Aanmaken…" : "Conceptregistratie aanmaken"}</button>
              <span className="text-xs text-gray-500">Geen automatische indiening of goedkeuring.</span>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
