"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  buildHistoricalReconstructionComparison,
  HistoricalReconstructionSourceType,
} from "@/lib/hour-reconstruction";

export interface ReconstructionActorOption {
  key: string;
  userId: string;
  therapistId: string | null;
  name: string;
  roleLabel: string;
}

export interface ReconstructionActivityOption {
  id: string;
  code: string;
  name: string;
  workPackageId: string;
  workPackageCode: string;
  workPackageName: string;
}

export interface ReconstructionRegisteredGroup {
  key: string;
  actorKey: string;
  activityId: string;
  registeredHours: number;
  approvedHours: number;
  openHours: number;
}

const sourceOptions: Array<{
  value: HistoricalReconstructionSourceType;
  label: string;
}> = [
  { value: "DOCUMENTED_SOURCE", label: "Gedocumenteerd — agenda, e-mail, notulen of resultaat" },
  { value: "MIXED_DOCUMENTATION", label: "Gemengd — documenten plus reconstructie projecteigenaar" },
  { value: "PROJECT_OWNER_RECONSTRUCTION", label: "Alleen reconstructie projecteigenaar — zwakkere bron" },
];

function formatHours(value: number) {
  return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(value);
}

export default function HistoricalReconstructionPlanner({
  asOf,
  actors,
  activities,
  groups,
}: {
  asOf: string;
  actors: ReconstructionActorOption[];
  activities: ReconstructionActivityOption[];
  groups: ReconstructionRegisteredGroup[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLDivElement>(null);
  const [selectedActorKey, setSelectedActorKey] = useState("");
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [targetHours, setTargetHours] = useState("");
  const [date, setDate] = useState("");
  const [entryHours, setEntryHours] = useState("");
  const [description, setDescription] = useState("");
  const [sourceType, setSourceType] = useState<HistoricalReconstructionSourceType>("DOCUMENTED_SOURCE");
  const [sourceReference, setSourceReference] = useState("");
  const [performedConfirmation, setPerformedConfirmation] = useState(false);
  const [requestId, setRequestId] = useState(() => globalThis.crypto.randomUUID());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const actorByKey = useMemo(() => new Map(actors.map((actor) => [actor.key, actor])), [actors]);
  const activityById = useMemo(
    () => new Map(activities.map((activity) => [activity.id, activity])),
    [activities],
  );
  const groupByKey = useMemo(
    () => new Map(groups.map((group) => [`${group.actorKey}|${group.activityId}`, group])),
    [groups],
  );

  const selectedActor = actorByKey.get(selectedActorKey) || null;
  const selectedActivity = activityById.get(selectedActivityId) || null;
  const selectedGroup = groupByKey.get(`${selectedActorKey}|${selectedActivityId}`);
  const registeredHours = selectedGroup?.registeredHours || 0;
  const numericTarget = targetHours === "" ? null : Number(targetHours);
  const numericEntryHours = entryHours === "" ? null : Number(entryHours);
  const targetIsValid = Boolean(
    numericTarget !== null &&
      Number.isFinite(numericTarget) &&
      numericTarget >= 0 &&
      Number.isInteger(numericTarget * 4),
  );
  const comparison =
    targetIsValid && numericTarget !== null
      ? buildHistoricalReconstructionComparison({ registeredHours, targetHours: numericTarget })
      : null;

  const sortedGroups = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          actor: actorByKey.get(group.actorKey),
          activity: activityById.get(group.activityId),
        }))
        .filter((group) => group.actor && group.activity)
        .sort((a, b) => {
          const actorCompare = a.actor!.name.localeCompare(b.actor!.name, "nl");
          return actorCompare || a.activity!.code.localeCompare(b.activity!.code, "nl");
        }),
    [activityById, actorByKey, groups],
  );

  function selectGroup(actorKey: string, activityId: string) {
    setSelectedActorKey(actorKey);
    setSelectedActivityId(activityId);
    setTargetHours("");
    setDate("");
    setEntryHours("");
    setDescription("");
    setSourceReference("");
    setPerformedConfirmation(false);
    setRequestId(globalThis.crypto.randomUUID());
    setError("");
    setSuccess("");
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!selectedActor || !selectedActivity || numericTarget === null) {
      setError("Kies een uitvoerder, activiteit en realistische doelstand.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/hours/reconstruction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          asOf,
          userId: selectedActor.userId,
          therapistId: selectedActor.therapistId,
          workPackageId: selectedActivity.workPackageId,
          activityId: selectedActivity.id,
          date,
          hours: entryHours,
          description,
          targetHours: numericTarget,
          sourceType,
          sourceReference,
          performedConfirmation,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Conceptregistratie aanmaken mislukt.");
        return;
      }

      setSuccess(
        `Concept van ${formatHours(Number(entryHours))} uur aangemaakt. Resterend verschil: ${formatHours(data.missingHoursAfter)} uur.`,
      );
      setDate("");
      setEntryHours("");
      setDescription("");
      setSourceReference("");
      setPerformedConfirmation(false);
      setRequestId(globalThis.crypto.randomUUID());
      router.refresh();
    } catch {
      setError("Verbindingsfout bij het aanmaken van de conceptregistratie.");
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = Boolean(
    selectedActor &&
      selectedActivity &&
      comparison?.state === "MISSING_REGISTRATION" &&
      numericEntryHours !== null &&
      Number.isFinite(numericEntryHours) &&
      numericEntryHours > 0 &&
      numericEntryHours <= 24 &&
      Number.isInteger(numericEntryHours * 4) &&
      numericEntryHours <= comparison.differenceHours &&
      date &&
      entryHours &&
      description.trim().length >= 10 &&
      sourceReference.trim().length >= 20 &&
      performedConfirmation &&
      !loading,
  );

  return (
    <div className="space-y-6">
      <section className="card border-amber-200 bg-amber-50">
        <h2 className="font-semibold text-amber-950">Wat deze reconstructie wel en niet doet</h2>
        <ul className="mt-2 space-y-1 text-sm text-amber-900 list-disc pl-5">
          <li>Je vergelijkt alle geregistreerde uren t/m {asOf} met een door jou onderbouwd werkelijk totaal.</li>
          <li>De begroting wordt niet als automatisch doel gebruikt; een verschil is geen bewijs van gewerkte uren.</li>
          <li>Iedere knop maakt maximaal één conceptregel. Datum, uren en werkzaamheden vul je zelf in.</li>
          <li>Indienen en goedkeuren blijven aparte handelingen; subsidiabiliteit wordt niet automatisch toegekend.</li>
        </ul>
      </section>

      <section className="card overflow-x-auto">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold">Tot nu toe geregistreerd</h2>
            <p className="text-sm text-gray-600">
              Alle statussen tellen mee in de resterende urenruimte. Controleer daarnaast datum,
              omschrijving en bron om inhoudelijke dubbelen te herkennen.
            </p>
          </div>
          <Link href="/uren" className="btn-secondary text-sm">Bestaande uren bekijken of corrigeren</Link>
        </div>
        <table className="w-full text-sm min-w-[780px]">
          <caption className="sr-only">
            Geregistreerde uren per uitvoerder en activiteit tot en met {asOf}
          </caption>
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th scope="col" className="py-2 pr-3">Uitvoerder</th>
              <th scope="col" className="py-2 pr-3">Functie</th>
              <th scope="col" className="py-2 pr-3">Werkzaamheid</th>
              <th scope="col" className="py-2 pr-3 text-right">Goedgekeurd</th>
              <th scope="col" className="py-2 pr-3 text-right">Open</th>
              <th scope="col" className="py-2 pr-3 text-right">Totaal</th>
              <th scope="col" className="py-2 text-right">Actie</th>
            </tr>
          </thead>
          <tbody>
            {sortedGroups.map((group) => (
              <tr key={group.key} className="border-b last:border-0">
                <td className="py-2 pr-3 font-medium">{group.actor!.name}</td>
                <td className="py-2 pr-3 text-gray-600">{group.actor!.roleLabel}</td>
                <td className="py-2 pr-3">
                  <span className="font-medium">{group.activity!.workPackageCode}.{group.activity!.code}</span>{" "}
                  {group.activity!.name}
                </td>
                <td className="py-2 pr-3 text-right">{formatHours(group.approvedHours)}</td>
                <td className="py-2 pr-3 text-right">{formatHours(group.openHours)}</td>
                <td className="py-2 pr-3 text-right font-semibold">{formatHours(group.registeredHours)}</td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    onClick={() => selectGroup(group.actorKey, group.activityId)}
                    aria-label={`Verschil beoordelen voor ${group.actor!.name}, ${group.activity!.workPackageCode}.${group.activity!.code} ${group.activity!.name}`}
                  >
                    Verschil beoordelen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section ref={formRef} className="card scroll-mt-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold">Reconstructielijn beoordelen</h2>
          <p className="text-sm text-gray-600">
            Kies ook een combinatie zonder bestaande uren als er aantoonbaar werk ontbreekt.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="reconstruction-actor" className="label">Uitvoerder</label>
              <select
                id="reconstruction-actor"
                className="input"
                value={selectedActorKey}
                onChange={(event) => selectGroup(event.target.value, selectedActivityId)}
                required
              >
                <option value="">Selecteer uitvoerder...</option>
                {actors.map((actor) => (
                  <option key={actor.key} value={actor.key}>
                    {actor.name} — {actor.roleLabel}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="reconstruction-activity" className="label">Werkzaamheid</label>
              <select
                id="reconstruction-activity"
                className="input"
                value={selectedActivityId}
                onChange={(event) => selectGroup(selectedActorKey, event.target.value)}
                required
              >
                <option value="">Selecteer activiteit...</option>
                {activities.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.workPackageCode}.{activity.code} — {activity.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedActor && selectedActivity && (
            <div className="grid sm:grid-cols-3 gap-3 rounded-lg bg-gray-50 p-4">
              <div>
                <div className="text-xs text-gray-500">Nu geregistreerd</div>
                <div className="text-xl font-semibold">{formatHours(registeredHours)} uur</div>
              </div>
              <div>
                <label htmlFor="reconstruction-target-hours" className="label">Werkelijk uitgevoerd totaal t/m {asOf}</label>
                <input
                  id="reconstruction-target-hours"
                  type="number"
                  min="0"
                  step="0.25"
                  value={targetHours}
                  onChange={(event) => setTargetHours(event.target.value)}
                  className="input"
                  placeholder="Handmatig onderbouwde stand"
                  required
                />
              </div>
              <div>
                <div className="text-xs text-gray-500">Verschil</div>
                <div className={`text-xl font-semibold ${
                  comparison?.state === "MISSING_REGISTRATION"
                    ? "text-amber-700"
                    : comparison?.state === "REVIEW_EXISTING"
                      ? "text-red-700"
                      : "text-green-700"
                }`}>
                  {comparison ? `${formatHours(comparison.differenceHours)} uur` : "—"}
                </div>
                {comparison?.state === "REVIEW_EXISTING" && (
                  <p className="text-xs text-red-700 mt-1">Controleer bestaande registraties; voeg niets toe.</p>
                )}
                {comparison?.state === "ALIGNED" && (
                  <p className="text-xs text-green-700 mt-1">Geen ontbrekende registratie.</p>
                )}
              </div>
            </div>
          )}

          {comparison?.state === "MISSING_REGISTRATION" && (
            <>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="reconstruction-date" className="label">Werkelijke uitvoeringsdatum</label>
                  <input
                    id="reconstruction-date"
                    type="date"
                    min="2025-09-01"
                    max={asOf}
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="reconstruction-entry-hours" className="label">Uren in deze conceptregel</label>
                  <input
                    id="reconstruction-entry-hours"
                    type="number"
                    min="0.25"
                    max={Math.min(24, comparison.differenceHours)}
                    step="0.25"
                    value={entryHours}
                    onChange={(event) => setEntryHours(event.target.value)}
                    className="input"
                    placeholder={`Maximaal ${formatHours(Math.min(24, comparison.differenceHours))}`}
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="reconstruction-description" className="label">Werkzaamheden</label>
                <textarea
                  id="reconstruction-description"
                  className="input"
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Concreet: wat is op deze datum uitgevoerd?"
                  minLength={10}
                  maxLength={1000}
                  required
                />
                <p className="mt-1 text-xs text-gray-500">Minimaal 10 en maximaal 1.000 tekens.</p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="reconstruction-source-type" className="label">Bronsoort</label>
                  <select
                    id="reconstruction-source-type"
                    className="input"
                    value={sourceType}
                    onChange={(event) => setSourceType(event.target.value as HistoricalReconstructionSourceType)}
                  >
                    {sourceOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="reconstruction-source-reference" className="label">Bron of onderbouwing</label>
                  <textarea
                    id="reconstruction-source-reference"
                    className="input"
                    rows={3}
                    value={sourceReference}
                    onChange={(event) => setSourceReference(event.target.value)}
                    placeholder="Bijv. Outlook-agenda 14-04-2026, overlegnotulen en opgeleverd concept..."
                    minLength={20}
                    maxLength={2000}
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Minimaal 20 en maximaal 2.000 tekens. Geen namen, contactgegevens,
                    cliëntnummers of gelabelde gezondheidsgegevens opnemen.
                  </p>
                </div>
              </div>

              {sourceType === "PROJECT_OWNER_RECONSTRUCTION" && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
                  Alleen jouw reconstructie is een zwakkere bron. Deze concepturen moeten vóór rapportage extra kritisch worden beoordeeld.
                </div>
              )}

              <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-4 text-sm">
                <input
                  type="checkbox"
                  checked={performedConfirmation}
                  onChange={(event) => setPerformedConfirmation(event.target.checked)}
                  className="mt-1 rounded"
                />
                <span>
                  Ik bevestig dat deze concrete werkzaamheden daadwerkelijk op de ingevulde datum zijn uitgevoerd.
                  De realistische doelstand is gebaseerd op uitvoering en bronnen, niet op de wens om de begroting te halen.
                </span>
              </label>

              {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
              {success && <div role="status" aria-live="polite" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{success}</div>}

              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" className="btn-primary" disabled={!canSubmit}>
                  {loading ? "Concept aanmaken..." : "Conceptregistratie aanmaken"}
                </button>
                <span className="text-xs text-gray-500">Geen automatische indiening of goedkeuring.</span>
              </div>
            </>
          )}
        </form>
      </section>
    </div>
  );
}
