"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_ATTENDEES = [
  // Management & extern
  "Marion Brouwer",
  "Sjoerd Hendriks",
  "Heidi Staring",
  "Luuk Smeekens",
  "Lodewijk Tromp",
  // Fysiotherapeuten
  "Koen Lensen",
  "Ryan Wessels",
  "Auke Huinink",
  "Dave van Perlo",
  "Esther Reijmerink",
  "Mark Reijnen-Thoonsen",
  "Anne Bronsema",
  "Daphne van den Heiligenberg",
  "Manon van Wezel",
  "Jolijn van Venrooij",
  "Claudia Graafmans",
  "Beate Schellekens",
  "Ties Luft",
  "Glenn Hellegers",
  // Overig
  "Chantal Graafmans",
  "Anouk Peters",
];

export default function TrainingForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attendees, setAttendees] = useState(
    DEFAULT_ATTENDEES.map((name) => ({ name, present: false }))
  );
  const [newAttendee, setNewAttendee] = useState("");

  function addAttendee() {
    if (newAttendee.trim()) {
      setAttendees([...attendees, { name: newAttendee.trim(), present: false }]);
      setNewAttendee("");
    }
  }

  function toggleAttendee(index: number) {
    const next = [...attendees];
    next[index].present = !next[index].present;
    setAttendees(next);
  }

  function removeAttendee(index: number) {
    setAttendees(attendees.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/trainings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          date: form.get("date"),
          hours: form.get("hours"),
          topic: form.get("topic"),
          notes: form.get("notes"),
          attendees,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Fout bij opslaan");
        return;
      }

      router.push("/trainingen");
      router.refresh();
    } catch {
      setError("Verbindingsfout");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl">
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="label">Naam training</label>
          <input type="text" name="name" className="input" required />
        </div>
        <div>
          <label className="label">Datum</label>
          <input type="date" name="date" className="input" required />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-4">
        <div>
          <label className="label">Onderwerp</label>
          <input type="text" name="topic" className="input" required />
        </div>
        <div>
          <label className="label">Duur (uren)</label>
          <input
            type="number"
            step="0.5"
            min="0.5"
            name="hours"
            className="input"
            required
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="label">Notities (optioneel)</label>
        <textarea name="notes" rows={2} className="input" />
      </div>

      {/* Attendees */}
      <div className="mt-6">
        <label className="label">Deelnemers</label>
        <div className="space-y-2 mt-2">
          {attendees.map((att, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg"
            >
              <input
                type="checkbox"
                checked={att.present}
                onChange={() => toggleAttendee(i)}
                className="rounded"
              />
              <span className={att.present ? "font-medium" : "text-gray-500"}>
                {att.name}
              </span>
              <span className="text-xs text-gray-400">
                {att.present ? "Aanwezig" : "Afwezig"}
              </span>
              <button
                type="button"
                onClick={() => removeAttendee(i)}
                className="ml-auto text-red-400 hover:text-red-600 text-xs"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-3">
          <input
            type="text"
            value={newAttendee}
            onChange={(e) => setNewAttendee(e.target.value)}
            placeholder="Naam toevoegen..."
            className="input flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addAttendee();
              }
            }}
          />
          <button type="button" onClick={addAttendee} className="btn-secondary">
            Toevoegen
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "Opslaan..." : "Training opslaan"}
        </button>
        <button type="button" onClick={() => router.back()} className="btn-secondary">
          Annuleren
        </button>
      </div>
    </form>
  );
}
