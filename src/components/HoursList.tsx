"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Entry {
  id: string;
  date: string;
  hours: number;
  description: string;
  status: string;

  createdAt: string;
  user: { id: string; name: string };
  workPackage: { code: string; name: string };
  activity: { code: string; name: string };
  therapist?: { id: string; name: string } | null;
}

export default function HoursList({
  entries,
  isAdmin,
  currentUserId,
}: {
  entries: Entry[];
  isAdmin: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHours, setEditHours] = useState<string>("");

  function toggleSelect(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleAll() {
    if (selected.size === entries.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(entries.map((e) => e.id)));
    }
  }

  async function bulkAction(action: string) {
    if (selected.size === 0) return;
    setLoading(true);
    try {
      await fetch("/api/hours/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected), action }),
      });
      setSelected(new Set());
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    setLoading(true);
    try {
      await fetch(`/api/hours/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }


  function startEdit(entry: Entry) {
    setEditingId(entry.id);
    setEditHours(String(entry.hours));
  }

  async function saveEdit(id: string) {
    const hours = Number(editHours);
    if (isNaN(hours) || hours <= 0) {
      setEditingId(null);
      return;
    }
    setLoading(true);
    try {
      await fetch(`/api/hours/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours }),
      });
      setEditingId(null);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function deleteEntry(id: string) {
    if (!confirm("Weet je zeker dat je dit wilt verwijderen?")) return;
    setLoading(true);
    try {
      await fetch(`/api/hours/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (entries.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-500">Geen uren gevonden.</p>
      </div>
    );
  }

  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);

  // Check if we can do bulk actions
  const canSubmit =
    isAdmin
      ? entries.some((e) => selected.has(e.id) && e.status === "DRAFT")
      : entries.some((e) => selected.has(e.id) && e.status === "DRAFT" && e.user.id === currentUserId);
  const canApprove =
    isAdmin && entries.some((e) => selected.has(e.id) && e.status === "SUBMITTED");

  return (
    <div className="card">
      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-primary-50 rounded-lg">
          <span className="text-sm font-medium">{selected.size} geselecteerd</span>
          {canSubmit && (
            <button
              onClick={() => bulkAction("submit")}
              disabled={loading}
              className="btn-primary text-sm py-1"
            >
              Indienen
            </button>
          )}
          {canApprove && (
            <button
              onClick={() => bulkAction("approve")}
              disabled={loading}
              className="btn-success text-sm py-1"
            >
              Goedkeuren
            </button>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="py-2 px-2">
                <input
                  type="checkbox"
                  checked={selected.size === entries.length && entries.length > 0}
                  onChange={toggleAll}
                  className="rounded"
                />
              </th>
              <th className="py-2 px-2">Datum</th>
              {isAdmin && <th className="py-2 px-2">Persoon</th>}
              <th className="py-2 px-2">Werkpakket</th>
              <th className="py-2 px-2">Activiteit</th>
              <th className="py-2 px-2">Omschrijving</th>
              <th className="py-2 px-2 text-right">Uren</th>
              <th className="py-2 px-2 text-center">Status</th>
              <th className="py-2 px-2 text-center">Acties</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 px-2">
                  <input
                    type="checkbox"
                    checked={selected.has(entry.id)}
                    onChange={() => toggleSelect(entry.id)}
                    className="rounded"
                  />
                </td>
                <td className="py-2 px-2 whitespace-nowrap">
                  {new Date(entry.date).toLocaleDateString("nl-NL")}
                </td>
                {isAdmin && (
                  <td className="py-2 px-2">
                    {entry.therapist ? entry.therapist.name : entry.user.name}
                  </td>
                )}
                <td className="py-2 px-2 whitespace-nowrap">
                  {entry.workPackage.code}
                </td>
                <td className="py-2 px-2">{entry.activity.name}</td>
                <td className="py-2 px-2 max-w-xs truncate">{entry.description}</td>
                <td className="py-2 px-2 text-right font-medium">
                  {editingId === entry.id ? (
                    <input
                      type="number"
                      step="0.25"
                      min="0.25"
                      value={editHours}
                      onChange={(e) => setEditHours(e.target.value)}
                      onBlur={() => saveEdit(entry.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(entry.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                      className="w-16 text-right border border-primary-300 rounded px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  ) : (
                    entry.hours
                  )}
                </td>
                <td className="py-2 px-2 text-center">
                  <span
                    className={
                      entry.status === "APPROVED"
                        ? "badge-approved"
                        : entry.status === "SUBMITTED"
                        ? "badge-submitted"
                        : "badge-draft"
                    }
                  >
                    {entry.status === "APPROVED"
                      ? "Goedgekeurd"
                      : entry.status === "SUBMITTED"
                      ? "Ingediend"
                      : "Concept"}
                  </span>
                </td>
                <td className="py-2 px-2 text-center">
                  <div className="flex items-center justify-center gap-1">
                    {entry.status === "DRAFT" && (isAdmin || entry.user.id === currentUserId) && (
                      <>
                        <button
                          onClick={() => startEdit(entry)}
                          disabled={loading}
                          className="text-amber-600 hover:text-amber-800 text-xs px-1"
                          title="Wijzigen"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => updateStatus(entry.id, "SUBMITTED")}
                          disabled={loading}
                          className="text-primary-600 hover:text-primary-800 text-xs px-1"
                          title="Indienen"
                        >
                          📤
                        </button>
                        <button
                          onClick={() => deleteEntry(entry.id)}
                          disabled={loading}
                          className="text-red-600 hover:text-red-800 text-xs px-1"
                          title="Verwijderen"
                        >
                          🗑️
                        </button>
                      </>
                    )}
                    {isAdmin && entry.status === "SUBMITTED" && (
                      <>
                        <button
                          onClick={() => updateStatus(entry.id, "APPROVED")}
                          disabled={loading}
                          className="text-green-600 hover:text-green-800 text-xs px-1"
                          title="Goedkeuren"
                        >
                          ✅
                        </button>
                        <button
                          onClick={() => updateStatus(entry.id, "DRAFT")}
                          disabled={loading}
                          className="text-gray-600 hover:text-gray-800 text-xs px-1"
                          title="Terugzetten naar concept"
                        >
                          ↩️
                        </button>
                      </>
                    )}
                    {isAdmin && entry.status === "APPROVED" && (
                      <Link
                        href={`/uren/${entry.id}/corrigeren`}
                        className="text-amber-700 hover:text-amber-900 text-xs px-1"
                        title="Auditbare correctie"
                      >
                        🛠️
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300">
              <td colSpan={isAdmin ? 6 : 5} className="py-2 px-2 font-semibold text-right">
                Totaal:
              </td>
              <td className="py-2 px-2 text-right font-bold">{totalHours.toFixed(1)}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-3 text-xs text-gray-400">
        Registratietijdstempel (createdAt) is onveranderlijk — RVO-auditproof.
      </div>
    </div>
  );
}
