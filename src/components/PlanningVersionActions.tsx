"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const DEFAULT_REBALANCE_REASON =
  "Toekomstige conceptmaanden herijken volgens de actuele projectfase: meer implementatie, monitoring en kennisdeling en iets minder projectmanagement.";

export default function PlanningVersionActions({
  hasVersion,
  hasFutureRebalance = false,
}: {
  hasVersion: boolean;
  hasFutureRebalance?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState(DEFAULT_REBALANCE_REASON);

  async function createVersion() {
    if (hasVersion) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/planning/versions", { method: "POST" });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok || !payload) {
        setError(payload?.error || "Conceptplanning aanmaken mislukt.");
        return;
      }
      router.refresh();
    } catch {
      setError("Verbindingsfout bij het aanmaken van de conceptplanning.");
    } finally {
      setLoading(false);
    }
  }

  async function rebalanceFuture() {
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 10) {
      setError("Geef een concrete herijkingsreden van minimaal 10 tekens.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/planning/rebalance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: trimmedReason }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok || !payload) {
        setError(payload?.error || "Toekomstplanning herijken mislukt.");
        return;
      }
      router.refresh();
    } catch {
      setError("Verbindingsfout bij het herijken van de toekomstplanning.");
    } finally {
      setLoading(false);
    }
  }

  if (!hasVersion) {
    return (
      <div className="max-w-sm space-y-2 text-right">
        <button type="button" className="btn-primary" disabled={loading} onClick={createVersion}>
          {loading ? "Conceptplanning opslaan…" : "Conceptplanning opslaan"}
        </button>
        {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
      </div>
    );
  }

  if (hasFutureRebalance) {
    return (
      <div className="max-w-sm rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-left text-sm text-emerald-900">
        <p className="font-semibold">Toekomstplanning is herijkt</p>
        <p className="mt-1 text-xs">Goedgekeurde maanden zijn behouden; toekomstige conceptmaanden bevatten de nieuwe verdeling.</p>
      </div>
    );
  }

  return (
    <div className="max-w-sm rounded-lg border border-amber-200 bg-amber-50 p-3 text-left">
      <p className="text-sm font-semibold text-amber-950">Toekomstige verdeling bijwerken</p>
      <p className="mt-1 text-xs text-amber-900">Goedgekeurde maanden blijven ongewijzigd. Alleen toekomstige conceptmaanden worden vervangen.</p>
      <label className="mt-3 block text-xs font-semibold text-amber-950" htmlFor="future-rebalance-reason">
        Reden voor herijking
      </label>
      <textarea
        id="future-rebalance-reason"
        className="input mt-1"
        rows={3}
        minLength={10}
        maxLength={500}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <button
        type="button"
        className="btn-primary mt-3 w-full"
        disabled={loading}
        onClick={rebalanceFuture}
      >
        {loading ? "Herijken…" : "Toekomstige conceptmaanden herijken"}
      </button>
      {error && <p role="alert" className="mt-2 text-sm font-medium text-red-700">{error}</p>}
    </div>
  );
}
