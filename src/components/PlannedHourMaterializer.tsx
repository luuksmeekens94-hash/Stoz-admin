"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export interface PlannedHourActor {
  key: string;
  userId: string;
  therapistId: string | null;
  name: string;
  roleLabel: string;
}

export interface PlannedHourSource {
  id: string;
  plannedDate: string;
  executorName: string;
  plannedHours: number;
  note: string | null;
  workPackageCode: string;
  activityCode: string;
  activityName: string;
  suggestedActorKey: string;
}

export default function PlannedHourMaterializer({
  planning,
  actors,
  today,
}: {
  planning: PlannedHourSource;
  actors: PlannedHourActor[];
  today: string;
}) {
  const router = useRouter();
  const [actorKey, setActorKey] = useState(planning.suggestedActorKey);
  const [date, setDate] = useState(planning.plannedDate);
  const [hours, setHours] = useState(String(planning.plannedHours));
  const [description, setDescription] = useState(planning.note || `${planning.activityName} uitgevoerd.`);
  const [sourceReference, setSourceReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isFuture = date > today;
  const actor = actors.find((candidate) => candidate.key === actorKey) || null;
  const numericHours = Number(hours);
  const canSubmit = Boolean(
    actor && date && !isFuture && numericHours > 0 && numericHours <= 24 &&
    Number.isInteger(numericHours * 4) && description.trim().length >= 10 &&
    sourceReference.trim().length >= 20 && confirmed && !saving,
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!actor || !canSubmit) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/hours/planning/${planning.id}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: actor.userId,
          therapistId: actor.therapistId,
          date,
          hours: numericHours,
          description,
          sourceReference,
          performedConfirmation: confirmed,
        }),
      });
      const payload = await response.json().catch(() => null) as { error?: string; id?: string } | null;
      if (!response.ok || !payload?.id) {
        setError(payload?.error || "De geplande regel kon niet als concept worden geregistreerd.");
        return;
      }
      router.push("/uren");
      router.refresh();
    } catch {
      setError("Verbindingsfout bij het registreren van de geplande regel.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card max-w-3xl border-blue-200 bg-blue-50/30">
      <div className="rounded-lg border border-blue-200 bg-white p-4">
        <div className="text-xs font-bold uppercase tracking-wide text-blue-700">Goedgekeurde planning</div>
        <h2 className="mt-1 text-lg font-semibold">{planning.workPackageCode}/{planning.activityCode} · {planning.activityName}</h2>
        <p className="mt-1 text-sm text-gray-600">
          Voorgesteld: {planning.executorName}, {planning.plannedHours.toLocaleString("nl-NL")} uur op {new Date(`${planning.plannedDate}T00:00:00.000Z`).toLocaleDateString("nl-NL", { timeZone: "UTC" })}.
        </p>
        <p className="mt-2 text-sm font-medium text-blue-950">
          Deze regel telt nog niet mee als werkelijk gewerkt. Corrigeer wat nodig is en bevestig pas na uitvoering.
        </p>
      </div>

      <form className="mt-5 space-y-4" onSubmit={submit}>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="planned-actor" className="label">Werkelijke uitvoerder</label>
            <select id="planned-actor" className="input" value={actorKey} onChange={(event) => setActorKey(event.target.value)} required>
              <option value="">Selecteer uitvoerder...</option>
              {actors.map((candidate) => <option key={candidate.key} value={candidate.key}>{candidate.name} — {candidate.roleLabel}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="planned-date" className="label">Werkelijke uitvoeringsdatum</label>
            <input id="planned-date" type="date" min="2025-09-01" max={today} className="input" value={date} onChange={(event) => setDate(event.target.value)} required />
          </div>
        </div>
        <div>
          <label htmlFor="planned-hours" className="label">Werkelijke uren</label>
          <input id="planned-hours" type="number" min="0.25" max="24" step="0.25" className="input" value={hours} onChange={(event) => setHours(event.target.value)} required />
          <p className="mt-1 text-xs text-gray-500">Afwijken van de geplande {planning.plannedHours.toLocaleString("nl-NL")} uur mag; de werkelijke inzet is leidend.</p>
        </div>
        <div>
          <label htmlFor="planned-description" className="label">Werkzaamheden</label>
          <textarea id="planned-description" rows={3} minLength={10} maxLength={1000} className="input" value={description} onChange={(event) => setDescription(event.target.value)} required />
        </div>
        <div>
          <label htmlFor="planned-source" className="label">Bron of onderbouwing</label>
          <textarea id="planned-source" rows={3} minLength={20} maxLength={2000} className="input" value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} required />
          <p className="mt-1 text-xs text-gray-500">Bijvoorbeeld agenda, overlegnotitie of opgeleverd document. Geen cliëntgegevens opnemen.</p>
        </div>
        <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-4 text-sm">
          <input type="checkbox" className="mt-1 rounded" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          <span>Ik bevestig dat deze concrete werkzaamheden daadwerkelijk op de ingevulde datum zijn uitgevoerd.</span>
        </label>
        {isFuture && <div role="alert" className="rounded-lg bg-amber-100 p-3 text-sm text-amber-900">Deze planning ligt nog in de toekomst en kan pas na uitvoering worden geregistreerd.</div>}
        {error && <div role="alert" className="rounded-lg bg-red-100 p-3 text-sm text-red-800">{error}</div>}
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn-primary" disabled={!canSubmit}>{saving ? "Aanmaken…" : "Conceptregistratie aanmaken"}</button>
          <button type="button" className="btn-secondary" onClick={() => router.back()}>Annuleren</button>
        </div>
        <p className="text-xs text-gray-500">De registratie start als concept en volgt daarna de bestaande indien- en goedkeuringsflow.</p>
      </form>
    </section>
  );
}
