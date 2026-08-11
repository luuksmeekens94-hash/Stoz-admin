"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function ForecastEntryForm({
  allocationId,
  defaultDate,
  defaultExecutor,
}: {
  allocationId: string;
  defaultDate: string;
  defaultExecutor: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    setBusy(true);
    setError("");
    const form = new FormData(target);
    try {
      const response = await fetch("/api/planning/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allocationId,
          plannedDate: form.get("plannedDate"),
          executorName: form.get("executorName"),
          plannedHours: Number(form.get("plannedHours")),
          note: form.get("note"),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error || "Forecast opslaan mislukt");
        return;
      }
      target.reset();
      router.refresh();
    } catch {
      setError("Forecast opslaan mislukt door een netwerkfout.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 grid gap-2 rounded-lg border border-primary-100 bg-primary-50 p-3 md:grid-cols-[150px_1fr_110px_1fr_auto]">
      <label className="text-xs font-medium text-gray-700">Datum<input name="plannedDate" type="date" defaultValue={defaultDate} required className="input mt-1 w-full" /></label>
      <label className="text-xs font-medium text-gray-700">Uitvoerder<input name="executorName" defaultValue={defaultExecutor} required minLength={2} maxLength={120} className="input mt-1 w-full" /></label>
      <label className="text-xs font-medium text-gray-700">Uren<input name="plannedHours" type="number" min="0.25" max="24" step="0.25" required className="input mt-1 w-full" /></label>
      <label className="text-xs font-medium text-gray-700">Toelichting<input name="note" maxLength={500} className="input mt-1 w-full" /></label>
      <button type="submit" disabled={busy} className="btn-secondary self-end">{busy ? "Opslaan…" : "Toevoegen"}</button>
      {error && <p role="alert" className="text-xs font-semibold text-red-700 md:col-span-5">{error}</p>}
    </form>
  );
}
