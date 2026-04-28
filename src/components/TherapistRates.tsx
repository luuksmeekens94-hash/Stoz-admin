"use client";

import { useState } from "react";

interface Therapist {
  id: string;
  name: string;
  hourlyRate: number | null;
}

export default function TherapistRates({ therapists: initial }: { therapists: Therapist[] }) {
  const [therapists, setTherapists] = useState(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function updateRate(id: string, rate: string) {
    setTherapists(prev => prev.map(t => t.id === id ? { ...t, hourlyRate: rate ? parseFloat(rate) : null } : t));
  }

  async function saveRate(id: string) {
    setSaving(id);
    const therapist = therapists.find(t => t.id === id);
    try {
      const res = await fetch("/api/therapists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, hourlyRate: therapist?.hourlyRate }),
      });
      if (res.ok) {
        setSaved(id);
        setTimeout(() => setSaved(null), 2000);
      }
    } catch {
      // silent
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-3">
      {therapists.map((t) => (
        <div key={t.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex-1 font-medium text-sm">{t.name}</div>
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm">€</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={t.hourlyRate ?? ""}
              onChange={(e) => updateRate(t.id, e.target.value)}
              onBlur={() => saveRate(t.id)}
              placeholder="—"
              className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:border-blue-400"
            />
            <span className="text-gray-400 text-sm">/uur</span>
            {saving === t.id && <span className="text-xs text-gray-400">opslaan...</span>}
            {saved === t.id && <span className="text-xs text-green-600">✓</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
