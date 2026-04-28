"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Client {
  id: string;
  clientCode: string;
  toolUsed: string;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  createdAt: string;
}

const TOOLS = ["Physitrack", "Thuisarts.nl", "Fysiotherapie.nl app", "Overig"];

export default function ClientList({ clients }: { clients: Client[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientCode: form.get("clientCode"),
          toolUsed: form.get("toolUsed"),
          startDate: form.get("startDate"),
          endDate: form.get("endDate") || null,
          notes: form.get("notes") || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Fout");
        return;
      }

      setShowForm(false);
      router.refresh();
    } catch {
      setError("Verbindingsfout");
    } finally {
      setLoading(false);
    }
  }

  async function setEndDate(id: string) {
    const endDate = new Date().toISOString().split("T")[0];
    await fetch(`/api/clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endDate }),
    });
    router.refresh();
  }

  return (
    <div>
      <button
        onClick={() => setShowForm(!showForm)}
        className="btn-primary mb-4"
      >
        {showForm ? "Annuleren" : "+ Cliënt toevoegen"}
      </button>

      {showForm && (
        <form onSubmit={handleAdd} className="card mb-6 max-w-2xl">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">Cliëntcode (anoniem)</label>
              <input
                type="text"
                name="clientCode"
                placeholder="bijv. C-001"
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">Tool/applicatie</label>
              <select name="toolUsed" className="input" required>
                <option value="">Selecteer...</option>
                {TOOLS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Startdatum</label>
              <input type="date" name="startDate" className="input" required />
            </div>
            <div>
              <label className="label">Einddatum (optioneel)</label>
              <input type="date" name="endDate" className="input" />
            </div>
          </div>
          <div className="mt-4">
            <label className="label">Notities (optioneel)</label>
            <input type="text" name="notes" className="input" />
          </div>

          {error && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary mt-4">
            {loading ? "Opslaan..." : "Opslaan"}
          </button>
        </form>
      )}

      <div className="card">
        {clients.length === 0 ? (
          <p className="text-gray-500 text-center py-8">Nog geen cliënten geregistreerd.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2 px-3">Code</th>
                  <th className="py-2 px-3">Tool</th>
                  <th className="py-2 px-3">Start</th>
                  <th className="py-2 px-3">Eind</th>
                  <th className="py-2 px-3">Notities</th>
                  <th className="py-2 px-3">Acties</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100">
                    <td className="py-2 px-3 font-medium">{c.clientCode}</td>
                    <td className="py-2 px-3">{c.toolUsed}</td>
                    <td className="py-2 px-3">
                      {new Date(c.startDate).toLocaleDateString("nl-NL")}
                    </td>
                    <td className="py-2 px-3">
                      {c.endDate
                        ? new Date(c.endDate).toLocaleDateString("nl-NL")
                        : <span className="badge-approved">Actief</span>}
                    </td>
                    <td className="py-2 px-3 text-gray-500">{c.notes || "—"}</td>
                    <td className="py-2 px-3">
                      {!c.endDate && (
                        <button
                          onClick={() => setEndDate(c.id)}
                          className="text-xs text-primary-600 hover:text-primary-800"
                        >
                          Afsluiten
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
