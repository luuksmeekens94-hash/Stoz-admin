"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlannedHourActor } from "@/components/PlannedHourMaterializer";

export default function PlannedHourCorrectionForm({
  entry,
  actors,
  currentSourceReference,
  today,
}: {
  entry: {
    id: string;
    date: string;
    hours: number;
    description: string;
    actorKey: string;
    workPackageCode: string;
    activityCode: string;
    activityName: string;
  };
  actors: PlannedHourActor[];
  currentSourceReference: string;
  today: string;
}) {
  const router = useRouter();
  const [actorKey, setActorKey] = useState(entry.actorKey);
  const [date, setDate] = useState(entry.date);
  const [hours, setHours] = useState(String(entry.hours));
  const [description, setDescription] = useState(entry.description);
  const [sourceReference, setSourceReference] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const actor = actors.find((candidate) => candidate.key === actorKey) || null;
  const numericHours = Number(hours);
  const canSubmit = Boolean(
    actor && date && date <= today && numericHours > 0 && numericHours <= 24 &&
    Number.isInteger(numericHours * 4) && description.trim().length >= 10 &&
    sourceReference.trim().length >= 20 && correctionReason.trim().length >= 15 &&
    confirmed && !saving,
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!actor || !canSubmit) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/hours/planning/entries/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "correct",
          userId: actor.userId,
          therapistId: actor.therapistId,
          date,
          hours: numericHours,
          description,
          sourceReference,
          correctionReason,
          performedConfirmation: confirmed,
        }),
      });
      const payload = await response.json().catch(() => null) as { error?: string; id?: string } | null;
      if (!response.ok || payload?.id !== entry.id) {
        setError(payload?.error || "Het planninguur kon niet auditbaar worden gecorrigeerd.");
        return;
      }
      router.push("/uren");
      router.refresh();
    } catch {
      setError("Verbindingsfout bij het corrigeren van het planninguur.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card max-w-3xl space-y-4 border-blue-200" onSubmit={submit}>
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <p className="font-bold">Bronplanning blijft vast</p>
        <p className="mt-1">{entry.workPackageCode}/{entry.activityCode} · {entry.activityName}</p>
        <p className="mt-2">Actuele bron: {currentSourceReference}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="planned-correction-actor" className="label">Werkelijke uitvoerder</label>
          <select id="planned-correction-actor" className="input" value={actorKey} onChange={(event) => setActorKey(event.target.value)} required>
            <option value="">Selecteer uitvoerder...</option>
            {actors.map((candidate) => (
              <option key={candidate.key} value={candidate.key}>{candidate.name} — {candidate.roleLabel}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="planned-correction-date" className="label">Werkelijke uitvoeringsdatum</label>
          <input id="planned-correction-date" type="date" min="2025-09-01" max={today} className="input" value={date} onChange={(event) => setDate(event.target.value)} required />
        </div>
      </div>
      <div>
        <label htmlFor="planned-correction-hours" className="label">Werkelijke uren</label>
        <input id="planned-correction-hours" type="number" min="0.25" max="24" step="0.25" className="input" value={hours} onChange={(event) => setHours(event.target.value)} required />
      </div>
      <div>
        <label htmlFor="planned-correction-description" className="label">Werkzaamheden</label>
        <textarea id="planned-correction-description" rows={3} minLength={10} maxLength={1000} className="input" value={description} onChange={(event) => setDescription(event.target.value)} required />
      </div>
      <div>
        <label htmlFor="planned-correction-source" className="label">Nieuwe bron of onderbouwing</label>
        <textarea id="planned-correction-source" rows={3} minLength={20} maxLength={2000} className="input" value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} required />
        <p className="mt-1 text-xs text-gray-500">Noem de concrete vindplaats. Neem geen cliëntgegevens op.</p>
      </div>
      <div>
        <label htmlFor="planned-correction-reason" className="label">Reden van de correctie</label>
        <textarea id="planned-correction-reason" rows={3} minLength={15} maxLength={1000} className="input" value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} required />
      </div>
      <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-4 text-sm">
        <input type="checkbox" className="mt-1 rounded" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        <span>Ik bevestig opnieuw dat deze gecorrigeerde werkzaamheden daadwerkelijk op de ingevulde datum zijn uitgevoerd.</span>
      </label>
      {date > today && <div role="alert" className="rounded-lg bg-amber-100 p-3 text-sm text-amber-900">Een toekomstige datum kan niet als werkelijke uitvoering worden opgeslagen.</div>}
      {error && <div role="alert" className="rounded-lg bg-red-100 p-3 text-sm text-red-800">{error}</div>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn-primary" disabled={!canSubmit}>{saving ? "Opslaan…" : "Planninguur auditbaar corrigeren"}</button>
        <button type="button" className="btn-secondary" onClick={() => router.push("/uren")}>Annuleren</button>
      </div>
    </form>
  );
}
