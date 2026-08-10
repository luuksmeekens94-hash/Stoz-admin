"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Therapist = { id: string; name: string };

export default function SurveyCampaignForm({ therapists }: { therapists: Therapist[] }) {
  const router = useRouter();
  const [name, setName] = useState("Therapeutmeting vóór brede implementatie");
  const [closesAt, setClosesAt] = useState("");
  const [recipientLines, setRecipientLines] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const therapistByName = new Map(therapists.map((therapist) => [therapist.name.toLocaleLowerCase("nl-NL"), therapist.id]));
    const recipients = recipientLines
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [recipientName, recipientEmail] = line.split(";").map((part) => part.trim());
        return {
          name: recipientName,
          email: recipientEmail,
          therapistId: therapistByName.get((recipientName || "").toLocaleLowerCase("nl-NL")) || null,
        };
      });

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, closesAt, recipients }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Campagne kon niet worden gemaakt.");
        return;
      }
      router.push(`/vragenlijsten/${data.id}`);
      router.refresh();
    } catch {
      setError("Verbindingsfout; er is geen campagne aangemaakt.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      <div>
        <label className="label">Naam campagne</label>
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} required />
      </div>
      <div>
        <label className="label">Invullen mogelijk t/m</label>
        <input className="input" type="date" value={closesAt} onChange={(event) => setClosesAt(event.target.value)} required />
      </div>
      <div>
        <label className="label">Geselecteerde therapeuten</label>
        <textarea className="input min-h-44 font-mono text-sm" value={recipientLines} onChange={(event) => setRecipientLines(event.target.value)} placeholder={"Jorik Hof; jorik@voorbeeld.nl\nJolijn van Venrooij; jolijn@voorbeeld.nl"} required />
        <p className="mt-1 text-xs text-gray-500">Eén persoon per regel: <code>Naam; e-mailadres</code>. Start voor de eerste meting bij voorkeur met 5–8 therapeuten.</p>
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      <button type="submit" disabled={saving} className="btn-primary">{saving ? "Concept maken…" : "Conceptcampagne maken"}</button>
      <p className="text-xs text-gray-500">Er wordt bij deze stap nog geen link of e-mail verzonden.</p>
    </form>
  );
}
