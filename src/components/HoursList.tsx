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
  isHistoricalReconstruction: boolean;
  reconstructionReview?: {
    integrity: "VALID" | "INVALID";
    asOf: string | null;
    confirmedTargetHours: number | null;
    sourceType: string | null;
    sourceReference: string | null;
    performedConfirmation: boolean;
    auditHistory: Array<{
      action: string;
      reason: string;
      actor: string;
      createdAt: string;
    }>;
  } | null;
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  DOCUMENTED_SOURCE: "Gedocumenteerde bron",
  MIXED_DOCUMENTATION: "Gemengde documentatie en reconstructie",
  PROJECT_OWNER_RECONSTRUCTION: "Verklaring projecteigenaar",
};
const ROW_ACTION_CLASS =
  "inline-flex min-h-6 min-w-6 items-center justify-center rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500";

async function assertSuccessfulResponse(response: Response, fallback: string) {
  if (response.ok) return;
  let message = fallback;
  try {
    const data = (await response.json()) as { error?: unknown };
    if (typeof data.error === "string" && data.error.trim()) {
      message = data.error;
    }
  } catch {
    // Gebruik de vaste, gebruikersvriendelijke fallback.
  }
  throw new Error(message);
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
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
  const [error, setError] = useState<string | null>(null);

  const selectableEntries = entries.filter(
    (entry) => !entry.isHistoricalReconstruction,
  );
  const selectedEntries = entries.filter((entry) => selected.has(entry.id));
  const allSelectableSelected =
    selectableEntries.length > 0 &&
    selectableEntries.every((entry) => selected.has(entry.id));

  function toggleSelect(entry: Entry) {
    if (entry.isHistoricalReconstruction) return;
    const next = new Set(selected);
    if (next.has(entry.id)) next.delete(entry.id);
    else next.add(entry.id);
    setSelected(next);
  }

  function toggleAll() {
    if (allSelectableSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableEntries.map((entry) => entry.id)));
    }
  }

  async function bulkAction(action: "submit" | "approve") {
    if (selected.size === 0) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/hours/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected), action }),
      });
      await assertSuccessfulResponse(response, "De geselecteerde uren konden niet worden bijgewerkt.");
      setSelected(new Set());
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught, "De geselecteerde uren konden niet worden bijgewerkt."));
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, status: string, historicalReconstruction = false) {
    setLoading(true);
    setError(null);
    try {
      const endpoint = historicalReconstruction
        ? `/api/hours/reconstruction/${id}`
        : `/api/hours/${id}`;
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await assertSuccessfulResponse(response, "De status kon niet worden bijgewerkt.");
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught, "De status kon niet worden bijgewerkt."));
    } finally {
      setLoading(false);
    }
  }

  async function approveHistoricalReconstruction(entry: Entry) {
    if (entry.reconstructionReview?.integrity !== "VALID") {
      setError("De reconstructieprovenance is niet volledig valide en kan niet worden goedgekeurd.");
      return;
    }
    if (
      !confirm(
        "Heb je brononderbouwing, bevestigde doelstand, uitvoeringsbevestiging en auditgeschiedenis gecontroleerd?",
      )
    ) {
      return;
    }
    await updateStatus(entry.id, "APPROVED", true);
  }

  function startEdit(entry: Entry) {
    setError(null);
    setEditingId(entry.id);
    setEditHours(String(entry.hours));
  }

  async function saveEdit(id: string) {
    const hours = Number(editHours);
    if (!Number.isFinite(hours) || hours <= 0) {
      setError("Vul een positief aantal uren in.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/hours/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours }),
      });
      await assertSuccessfulResponse(response, "De uren konden niet worden gewijzigd.");
      setEditingId(null);
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught, "De uren konden niet worden gewijzigd."));
    } finally {
      setLoading(false);
    }
  }

  async function deleteEntry(id: string, historicalReconstruction = false) {
    if (!confirm("Weet je zeker dat je dit wilt verwijderen?")) return;
    setLoading(true);
    setError(null);
    try {
      const endpoint = historicalReconstruction
        ? `/api/hours/reconstruction/${id}`
        : `/api/hours/${id}`;
      const response = await fetch(endpoint, { method: "DELETE" });
      await assertSuccessfulResponse(response, "De urenregel kon niet worden verwijderd.");
      setSelected((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught, "De urenregel kon niet worden verwijderd."));
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

  const totalHours = entries.reduce((sum, entry) => sum + entry.hours, 0);
  const canSubmit =
    selectedEntries.length > 0 &&
    selectedEntries.every(
      (entry) =>
        entry.status === "DRAFT" &&
        (isAdmin ||
          (entry.user.id === currentUserId && !entry.isHistoricalReconstruction)),
    );
  const canApprove =
    isAdmin &&
    selectedEntries.length > 0 &&
    selectedEntries.every(
      (entry) => entry.status === "SUBMITTED" && !entry.isHistoricalReconstruction,
    );

  return (
    <div className="card">
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-primary-50 rounded-lg">
          <span className="text-sm font-medium">{selected.size} geselecteerd</span>
          {canSubmit && (
            <button
              onClick={() => bulkAction("submit")}
              disabled={loading}
              className="btn-primary text-sm py-1"
              aria-label="Indienen geselecteerde urenregels"
            >
              Indienen
            </button>
          )}
          {canApprove && (
            <button
              onClick={() => bulkAction("approve")}
              disabled={loading}
              className="btn-success text-sm py-1"
              aria-label="Goedkeuren geselecteerde urenregels"
            >
              Goedkeuren
            </button>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Urenregistraties en beschikbare acties</caption>
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="py-2 px-2" scope="col">
                <input
                  type="checkbox"
                  checked={allSelectableSelected}
                  onChange={toggleAll}
                  disabled={selectableEntries.length === 0 || loading}
                  className="rounded"
                  aria-label="Selecteer alle beschikbare urenregels"
                />
              </th>
              <th className="py-2 px-2" scope="col">Datum</th>
              {isAdmin && <th className="py-2 px-2" scope="col">Persoon</th>}
              <th className="py-2 px-2" scope="col">Werkpakket</th>
              <th className="py-2 px-2" scope="col">Activiteit</th>
              <th className="py-2 px-2" scope="col">Omschrijving</th>
              <th className="py-2 px-2 text-right" scope="col">Uren</th>
              <th className="py-2 px-2 text-center" scope="col">Status</th>
              <th className="py-2 px-2 text-center" scope="col">Acties</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const displayName = entry.therapist ? entry.therapist.name : entry.user.name;
              const canSelect = !entry.isHistoricalReconstruction;
              const canManageDraft =
                entry.status === "DRAFT" &&
                (isAdmin || entry.user.id === currentUserId);
              return (
                <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-2">
                    <input
                      type="checkbox"
                      checked={selected.has(entry.id)}
                      onChange={() => toggleSelect(entry)}
                      disabled={!canSelect || loading}
                      className="rounded"
                      aria-label={
                        entry.isHistoricalReconstruction
                          ? `Selecteer historische reconstructie van ${displayName}`
                          : `Selecteer urenregel van ${displayName}`
                      }
                    />
                  </td>
                  <td className="py-2 px-2 whitespace-nowrap">
                    {new Date(entry.date).toLocaleDateString("nl-NL", {
                      timeZone: "Europe/Amsterdam",
                    })}
                  </td>
                  {isAdmin && <td className="py-2 px-2">{displayName}</td>}
                  <td className="py-2 px-2 whitespace-nowrap">{entry.workPackage.code}</td>
                  <td className="py-2 px-2">{entry.activity.name}</td>
                  <td className="py-2 px-2 max-w-xs">
                    <span className="block truncate">{entry.description}</span>
                    {entry.isHistoricalReconstruction && (
                      <span className="mt-1 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                        Historische reconstructie
                      </span>
                    )}
                    {isAdmin && entry.isHistoricalReconstruction && entry.reconstructionReview && (
                      <details className="mt-2 min-w-72 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-gray-800">
                        <summary className="cursor-pointer font-semibold text-amber-900">
                          Bron en audittrail beoordelen
                        </summary>
                        {entry.reconstructionReview.integrity !== "VALID" ? (
                          <p role="alert" className="mt-2 font-semibold text-red-700">
                            Provenance ongeldig of onvolledig — goedkeuring is geblokkeerd.
                          </p>
                        ) : (
                          <dl className="mt-2 grid gap-1">
                            <div>
                              <dt className="font-semibold">Brontype</dt>
                              <dd>
                                {SOURCE_TYPE_LABELS[entry.reconstructionReview.sourceType || ""] ||
                                  entry.reconstructionReview.sourceType}
                              </dd>
                            </div>
                            {entry.reconstructionReview.sourceType ===
                              "PROJECT_OWNER_RECONSTRUCTION" && (
                              <div className="rounded border border-orange-300 bg-orange-100 p-2 font-semibold text-orange-900">
                                Zwakke bron: verklaring van de projecteigenaar. Beoordeel extra kritisch en
                                vraag waar mogelijk aanvullend bewijs op.
                              </div>
                            )}
                            <div>
                              <dt className="font-semibold">Bronverwijzing</dt>
                              <dd className="whitespace-normal break-words">
                                {entry.reconstructionReview.sourceReference}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-semibold">Peildatum / bevestigde doelstand</dt>
                              <dd>
                                {entry.reconstructionReview.asOf} /{" "}
                                {entry.reconstructionReview.confirmedTargetHours?.toFixed(2)} uur
                              </dd>
                            </div>
                            <div>
                              <dt className="font-semibold">Werkelijke uitvoering bevestigd</dt>
                              <dd>{entry.reconstructionReview.performedConfirmation ? "Ja" : "Nee"}</dd>
                            </div>
                          </dl>
                        )}
                        <div className="mt-2 border-t border-amber-200 pt-2">
                          <p className="font-semibold">Auditgeschiedenis</p>
                          <ol className="mt-1 space-y-1">
                            {entry.reconstructionReview.auditHistory.map((audit, index) => (
                              <li key={`${audit.createdAt}-${audit.action}-${index}`}>
                                {new Date(audit.createdAt).toLocaleString("nl-NL", {
                                  timeZone: "Europe/Amsterdam",
                                })}
                                {" — "}
                                {audit.action} · {audit.actor}
                              </li>
                            ))}
                          </ol>
                        </div>
                      </details>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right font-medium">
                    {editingId === entry.id ? (
                      <input
                        type="number"
                        step="0.25"
                        min="0.25"
                        max="24"
                        value={editHours}
                        onChange={(event) => setEditHours(event.target.value)}
                        onBlur={() => saveEdit(entry.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") saveEdit(entry.id);
                          if (event.key === "Escape") setEditingId(null);
                        }}
                        autoFocus
                        aria-label={`Uren wijzigen voor ${displayName}`}
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
                      {canManageDraft && (
                        <>
                          {!entry.isHistoricalReconstruction && (
                            <button
                              onClick={() => startEdit(entry)}
                              disabled={loading}
                              className={`${ROW_ACTION_CLASS} text-amber-600 hover:text-amber-800`}
                              title="Wijzigen"
                              aria-label={`Wijzigen urenregel van ${displayName}`}
                            >
                              ✏️
                            </button>
                          )}
                          {(!entry.isHistoricalReconstruction || isAdmin) && (
                            <button
                              onClick={() =>
                                updateStatus(
                                  entry.id,
                                  "SUBMITTED",
                                  entry.isHistoricalReconstruction,
                                )
                              }
                              disabled={
                                loading ||
                                (entry.isHistoricalReconstruction &&
                                  entry.reconstructionReview?.integrity !== "VALID")
                              }
                              className={`${ROW_ACTION_CLASS} text-primary-600 hover:text-primary-800`}
                              title="Indienen"
                              aria-label={
                                entry.isHistoricalReconstruction
                                  ? `Indienen historische reconstructie van ${displayName}`
                                  : `Indienen urenregel van ${displayName}`
                              }
                            >
                              📤
                            </button>
                          )}
                          {(!entry.isHistoricalReconstruction || isAdmin) && (
                            <button
                              onClick={() => deleteEntry(entry.id, entry.isHistoricalReconstruction)}
                              disabled={loading}
                              className={`${ROW_ACTION_CLASS} text-red-600 hover:text-red-800`}
                              title="Verwijderen"
                              aria-label={
                                entry.isHistoricalReconstruction
                                  ? `Verwijderen historische reconstructie van ${displayName}`
                                  : `Verwijderen urenregel van ${displayName}`
                              }
                            >
                              🗑️
                            </button>
                          )}
                          {entry.isHistoricalReconstruction && !isAdmin && (
                            <span className="text-xs text-gray-500">Beheerder beheert dit concept</span>
                          )}
                        </>
                      )}
                      {isAdmin && entry.status === "SUBMITTED" && (
                        <>
                          <button
                            onClick={() =>
                              entry.isHistoricalReconstruction
                                ? approveHistoricalReconstruction(entry)
                                : updateStatus(entry.id, "APPROVED")
                            }
                            disabled={
                              loading ||
                              (entry.isHistoricalReconstruction &&
                                entry.reconstructionReview?.integrity !== "VALID")
                            }
                            className={`${ROW_ACTION_CLASS} text-green-600 hover:text-green-800`}
                            title={
                              entry.isHistoricalReconstruction
                                ? "Reconstructie beoordelen en goedkeuren"
                                : "Goedkeuren"
                            }
                            aria-label={
                              entry.isHistoricalReconstruction
                                ? `Reconstructie beoordelen en goedkeuren voor ${displayName}`
                                : `Goedkeuren urenregel van ${displayName}`
                            }
                          >
                            ✅
                          </button>
                          <button
                            onClick={() =>
                              updateStatus(
                                entry.id,
                                "DRAFT",
                                entry.isHistoricalReconstruction,
                              )
                            }
                            disabled={loading}
                            className={`${ROW_ACTION_CLASS} text-gray-600 hover:text-gray-800`}
                            title="Terugzetten naar concept"
                            aria-label={`Terugzetten naar concept voor ${displayName}`}
                          >
                            ↩️
                          </button>
                        </>
                      )}
                      {isAdmin && entry.status === "APPROVED" && !entry.isHistoricalReconstruction && (
                        <Link
                          href={`/uren/${entry.id}/corrigeren`}
                          className={`${ROW_ACTION_CLASS} text-amber-700 hover:text-amber-900`}
                          title="Auditbare correctie"
                          aria-label={`Auditbare correctie voor ${displayName}`}
                        >
                          🛠️
                        </Link>
                      )}
                      {isAdmin && entry.status === "APPROVED" && entry.isHistoricalReconstruction && (
                        <button
                          onClick={() =>
                              updateStatus(
                                entry.id,
                                "DRAFT",
                                entry.isHistoricalReconstruction,
                              )
                            }
                          disabled={loading}
                          className={`${ROW_ACTION_CLASS} text-amber-700 hover:text-amber-900`}
                          title="Terugzetten naar concept voor herstel"
                          aria-label={`Terugzetten voor herstel van historische reconstructie van ${displayName}`}
                        >
                          ↩️ Herstel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
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

      <div className="mt-3 text-xs text-gray-500">
        De applicatie bewaart registratietijdstempels en auditgebeurtenissen. Formele juistheid,
        bewijskracht en subsidiabiliteit blijven afzonderlijk te beoordelen.
      </div>
    </div>
  );
}
