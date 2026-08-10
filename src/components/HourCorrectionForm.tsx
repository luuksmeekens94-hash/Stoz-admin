"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface CorrectionEntry {
  id: string;
  date: string;
  hours: number;
  description: string;
  workPackageId: string;
  activityId: string;
  therapistId: string | null;
}

interface WorkPackageOption {
  id: string;
  code: string;
  name: string;
  activities: Array<{ id: string; code: string; name: string }>;
}

interface TherapistOption {
  id: string;
  name: string;
}

export default function HourCorrectionForm({
  entry,
  workPackages,
  therapists,
}: {
  entry: CorrectionEntry;
  workPackages: WorkPackageOption[];
  therapists: TherapistOption[];
}) {
  const router = useRouter();
  const [date, setDate] = useState(entry.date.slice(0, 10));
  const [hours, setHours] = useState(String(entry.hours));
  const [description, setDescription] = useState(entry.description);
  const [workPackageId, setWorkPackageId] = useState(entry.workPackageId);
  const [activityId, setActivityId] = useState(entry.activityId);
  const [therapistId, setTherapistId] = useState(entry.therapistId ?? "");
  const [correctionReason, setCorrectionReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activities = useMemo(
    () => workPackages.find((item) => item.id === workPackageId)?.activities ?? [],
    [workPackageId, workPackages]
  );

  function selectWorkPackage(nextId: string) {
    setWorkPackageId(nextId);
    const firstActivity = workPackages.find((item) => item.id === nextId)?.activities[0];
    setActivityId(firstActivity?.id ?? "");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/hours/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          hours,
          description,
          workPackageId,
          activityId,
          therapistId: therapistId || null,
          correctionReason,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Correctie mislukt");

      router.push("/uren?status=APPROVED");
      router.refresh();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Correctie mislukt");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="card space-y-5" onSubmit={submit}>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        De goedgekeurde registratie wordt niet verwijderd. De oude en nieuwe waarden, reden, datum en
        beheerder worden als auditgebeurtenis vastgelegd.
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm font-medium">
          <span>Datum</span>
          <input
            className="input"
            type="date"
            min="2025-09-01"
            max="2027-09-01"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </label>
        <label className="space-y-1 text-sm font-medium">
          <span>Uren</span>
          <input
            className="input"
            type="number"
            min="0.25"
            max="24"
            step="0.25"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            required
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm font-medium">
          <span>Werkpakket</span>
          <select className="input" value={workPackageId} onChange={(event) => selectWorkPackage(event.target.value)}>
            {workPackages.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} · {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">
          <span>Activiteit</span>
          <select className="input" value={activityId} onChange={(event) => setActivityId(event.target.value)}>
            {activities.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} · {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="space-y-1 text-sm font-medium">
        <span>Therapeut, indien van toepassing</span>
        <select className="input" value={therapistId} onChange={(event) => setTherapistId(event.target.value)}>
          <option value="">Geen individuele therapeut</option>
          {therapists.map((therapist) => (
            <option key={therapist.id} value={therapist.id}>
              {therapist.name}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1 text-sm font-medium">
        <span>Herleidbare omschrijving</span>
        <textarea
          className="input min-h-24"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          required
        />
      </label>

      <label className="space-y-1 text-sm font-medium">
        <span>Correctiereden</span>
        <textarea
          className="input min-h-24"
          placeholder="Beschrijf de invoerfout en waarop de gecorrigeerde waarde is gebaseerd."
          value={correctionReason}
          onChange={(event) => setCorrectionReason(event.target.value)}
          minLength={15}
          required
        />
      </label>

      <div className="flex flex-wrap gap-3">
        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? "Correctie opslaan..." : "Correctie met auditspoor opslaan"}
        </button>
        <button className="btn-secondary" type="button" onClick={() => router.back()} disabled={loading}>
          Annuleren
        </button>
      </div>
    </form>
  );
}
