"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ForecastEntryDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (!window.confirm("Deze forecastregel verwijderen?")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/planning/forecast/${id}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error || "Verwijderen mislukt");
        return;
      }
      router.refresh();
    } catch {
      setError("Verwijderen mislukt door een netwerkfout.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" onClick={remove} disabled={busy} aria-label="Forecastregel verwijderen" className="min-h-6 px-2 py-1 text-xs font-semibold text-red-700 hover:underline">{busy ? "Bezig…" : "Verwijder"}</button>
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </span>
  );
}
