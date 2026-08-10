"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function PlanningVersionActions({ hasVersion }: { hasVersion: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function createVersion() {
    if (hasVersion) return;

    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/planning/versions", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error || "Conceptplanning aanmaken mislukt");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm space-y-2 text-right">
      <button
        type="button"
        className="btn-primary"
        disabled={loading || hasVersion}
        onClick={createVersion}
      >
        {loading
          ? "Conceptplanning opslaan…"
          : hasVersion
            ? "Revisie geblokkeerd tot herijkte baseline"
            : "Conceptplanning opslaan"}
      </button>
      {hasVersion && (
        <p className="text-xs text-amber-800">
          Een volgende revisie vereist eerst een expliciete actualbaseline; de vaste restantenset wordt niet opnieuw gekopieerd.
        </p>
      )}
      {error && <p className="text-sm font-medium text-red-700">{error}</p>}
    </div>
  );
}
