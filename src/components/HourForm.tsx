"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Activity {
  id: string;
  code: string;
  name: string;
}

interface WorkPackage {
  id: string;
  code: string;
  name: string;
  activities: Activity[];
}

interface User {
  id: string;
  name: string;
  role: string;
}

interface Therapist {
  id: string;
  name: string;
  hourlyRate: number | null;
}

interface ActivityOption extends Activity {
  workPackageId: string;
  workPackageCode: string;
  workPackageName: string;
}

function browserAmsterdamDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export default function HourForm({
  workPackages,
  currentUser,
  allUsers,
  therapists,
  initialValues,
  ordinaryRegistrationDate,
}: {
  workPackages: WorkPackage[];
  currentUser: User;
  allUsers?: User[];
  therapists?: Therapist[];
  initialValues?: { activityId?: string; description?: string };
  ordinaryRegistrationDate: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const isAdmin = currentUser.role === "ADMIN";

  const selectableUsers = useMemo(
    () => (isAdmin && allUsers && allUsers.length > 0 ? allUsers : [currentUser]),
    [allUsers, currentUser, isAdmin]
  );
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([currentUser.id]);
  const [selectedTherapists, setSelectedTherapists] = useState<string[]>([]);
  const [therapistDropdownOpen, setTherapistDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [date, setDate] = useState(ordinaryRegistrationDate);
  const [hours, setHours] = useState("");
  const [description, setDescription] = useState(initialValues?.description || "");
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>(
    initialValues?.activityId ? [initialValues.activityId] : [],
  );

  const selectedUsers = selectableUsers.filter((user) => selectedUserIds.includes(user.id));
  const showTherapistPicker = selectedUsers.some((user) => user.role === "TEAM");

  const activityOptions = useMemo<ActivityOption[]>(
    () =>
      workPackages.flatMap((workPackage) =>
        workPackage.activities.map((activity) => ({
          ...activity,
          workPackageId: workPackage.id,
          workPackageCode: workPackage.code,
          workPackageName: workPackage.name,
        }))
      ),
    [workPackages]
  );

  const selectedActivities = activityOptions.filter((activity) =>
    selectedActivityIds.includes(activity.id)
  );

  const totalEntries = selectedUsers.reduce((sum, user) => {
    const personCount = user.role === "TEAM" ? selectedTherapists.length : 1;
    return sum + personCount * selectedActivities.length;
  }, 0);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setTherapistDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setDate(ordinaryRegistrationDate);
    const timer = window.setInterval(() => {
      if (browserAmsterdamDateKey() !== ordinaryRegistrationDate) router.refresh();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [ordinaryRegistrationDate, router]);

  function toggleUser(id: string) {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((userId) => userId !== id) : [...prev, id]
    );
  }

  function toggleActivity(id: string) {
    setSelectedActivityIds((prev) =>
      prev.includes(id)
        ? prev.filter((activityId) => activityId !== id)
        : [...prev, id]
    );
  }

  function toggleWorkPackage(workPackage: WorkPackage) {
    const activityIds = workPackage.activities.map((activity) => activity.id);
    const allSelected = activityIds.every((id) => selectedActivityIds.includes(id));

    setSelectedActivityIds((prev) =>
      allSelected
        ? prev.filter((id) => !activityIds.includes(id))
        : Array.from(new Set([...prev, ...activityIds]))
    );
  }

  function toggleTherapist(id: string) {
    setSelectedTherapists((prev) =>
      prev.includes(id) ? prev.filter((therapistId) => therapistId !== id) : [...prev, id]
    );
  }

  function selectAllTherapists() {
    if (!therapists) return;
    if (selectedTherapists.length === therapists.length) {
      setSelectedTherapists([]);
    } else {
      setSelectedTherapists(therapists.map((therapist) => therapist.id));
    }
  }

  const selectedTherapistNames =
    therapists?.filter((therapist) => selectedTherapists.includes(therapist.id)).map((t) => t.name) ||
    [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (selectedUsers.length === 0) {
      setError("Selecteer minimaal één deelnemer");
      return;
    }

    if (selectedActivities.length === 0) {
      setError("Selecteer minimaal één werkzaamheid");
      return;
    }

    if (showTherapistPicker && selectedTherapists.length === 0) {
      setError("Selecteer minimaal één fysiotherapeut voor het teamaccount");
      return;
    }

    const hoursPerEntry = Number(hours);
    if (
      totalEntries > 1 &&
      !confirm(
        `${hoursPerEntry} uur wordt per persoon-activiteitcombinatie opgeslagen: ${totalEntries} regels, samen ${hoursPerEntry * totalEntries} uur. Doorgaan?`,
      )
    ) {
      return;
    }

    setLoading(true);

    try {
      const entries = selectedUsers.flatMap((user) => {
        const therapistIds = user.role === "TEAM" ? selectedTherapists : [null];

        return therapistIds.flatMap((therapistId) =>
          selectedActivities.map((activity) => ({
            date,
            hours,
            description:
              description ||
              `${activity.workPackageCode} ${activity.code} werkzaamheden`,
            workPackageId: activity.workPackageId,
            activityId: activity.id,
            ...(isAdmin ? { onBehalfOf: user.id } : {}),
            ...(therapistId ? { therapistId } : {}),
          }))
        );
      });

      const res = await fetch("/api/hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Opslaan mislukt");
        return;
      }

      if (entries.length > 1) {
        setSuccess(`${entries.length} registraties aangemaakt`);
        setSelectedActivityIds([]);
        setHours("");
        setDescription("");
        setTimeout(() => {
          router.push("/uren");
          router.refresh();
        }, 1200);
      } else {
        router.push("/uren");
        router.refresh();
      }
    } catch {
      setError("Verbindingsfout");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-4xl">
      {isAdmin && selectableUsers.length > 0 && (
        <fieldset className="mb-5">
          <legend className="label mb-0">Deelnemers</legend>
          <span className="mb-2 block text-xs text-gray-500">
            {selectedUsers.length} geselecteerd
          </span>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {selectableUsers.map((user) => (
              <label
                key={user.id}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                  selectedUserIds.includes(user.id)
                    ? "border-primary-300 bg-primary-50 text-primary-800"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedUserIds.includes(user.id)}
                  onChange={() => toggleUser(user.id)}
                  className="rounded"
                />
                <span className="font-medium">{user.name}</span>
                <span className="ml-auto text-xs text-gray-400">{user.role}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {showTherapistPicker && therapists && therapists.length > 0 && (
        <div className="mb-5" ref={dropdownRef}>
          <fieldset>
            <legend className="label">
              Fysiotherapeut(en)
              {selectedTherapists.length > 0 && (
                <span className="ml-2 text-primary-600 font-normal text-xs">
                  {selectedTherapists.length} geselecteerd
                </span>
              )}
            </legend>
            <div className="relative">
              <button
                type="button"
                onClick={() => setTherapistDropdownOpen(!therapistDropdownOpen)}
                className="input text-left w-full flex items-center justify-between"
                aria-expanded={therapistDropdownOpen}
                aria-controls="therapist-options"
              >
                <span className={selectedTherapists.length === 0 ? "text-gray-400" : ""}>
                  {selectedTherapists.length === 0
                    ? "Selecteer fysiotherapeut(en)..."
                    : selectedTherapistNames.length <= 3
                    ? selectedTherapistNames.join(", ")
                    : `${selectedTherapistNames.slice(0, 2).join(", ")} +${
                        selectedTherapistNames.length - 2
                      }`}
                </span>
                <span aria-hidden="true" className="text-gray-400 text-xs">
                  {therapistDropdownOpen ? "▲" : "▼"}
                </span>
              </button>

              {therapistDropdownOpen && (
                <div
                  id="therapist-options"
                  className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto"
                >
                  <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 font-medium text-sm">
                    <input
                      type="checkbox"
                      checked={selectedTherapists.length === therapists.length}
                      onChange={selectAllTherapists}
                      className="rounded"
                    />
                    Alles selecteren ({therapists.length})
                  </label>
                  {therapists.map((therapist) => (
                    <label
                      key={therapist.id}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTherapists.includes(therapist.id)}
                        onChange={() => toggleTherapist(therapist.id)}
                        className="rounded"
                      />
                      {therapist.name}
                      {therapist.hourlyRate && (
                        <span className="text-gray-400 text-xs ml-auto">€{therapist.hourlyRate}/u</span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </fieldset>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="hour-date" className="label">Datum</label>
          <input
            id="hour-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input"
            min={ordinaryRegistrationDate}
            max={ordinaryRegistrationDate}
            aria-describedby="hour-date-guidance"
            required
          />
          <p id="hour-date-guidance" className="mt-1 text-xs text-gray-500">
            Gewone registratie is alleen mogelijk op vandaag. Eerdere werkelijk uitgevoerde inzet
            loopt via de auditbare historische reconstructie door een beheerder.
          </p>
        </div>
        <div>
          <label htmlFor="hour-hours" className="label">Uren per registratie</label>
          <input
            id="hour-hours"
            type="number"
            step="0.25"
            min="0.25"
            max="24"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="bijv. 2.5"
            className="input"
            required
          />
        </div>
      </div>

      <fieldset className="mt-5">
        <legend className="label mb-0">Werkzaamheden</legend>
        <span className="mb-2 block text-xs text-gray-500">
          {selectedActivities.length} geselecteerd
        </span>
        <div className="space-y-3">
          {workPackages.map((workPackage) => {
            const activityIds = workPackage.activities.map((activity) => activity.id);
            const allSelected = activityIds.every((id) => selectedActivityIds.includes(id));
            const someSelected = activityIds.some((id) => selectedActivityIds.includes(id));

            return (
              <div key={workPackage.id} className="rounded-lg border border-gray-200 p-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(input) => {
                      if (input) input.indeterminate = someSelected && !allSelected;
                    }}
                    onChange={() => toggleWorkPackage(workPackage)}
                    className="rounded"
                  />
                  {workPackage.code}: {workPackage.name}
                </label>
                <div className="grid sm:grid-cols-2 gap-2 mt-3">
                  {workPackage.activities.map((activity) => (
                    <label
                      key={activity.id}
                      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm cursor-pointer transition-colors ${
                        selectedActivityIds.includes(activity.id)
                          ? "bg-primary-50 text-primary-800"
                          : "bg-gray-50 hover:bg-gray-100"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedActivityIds.includes(activity.id)}
                        onChange={() => toggleActivity(activity.id)}
                        className="rounded"
                      />
                      <span className="font-medium">{activity.code}</span>
                      <span>{activity.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-4">
        <label htmlFor="hour-description" className="label">
          Omschrijving <span className="text-gray-400 font-normal">(optioneel)</span>
        </label>
        <textarea
          id="hour-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Korte toelichting op de werkzaamheden..."
          className="input"
        />
      </div>

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          aria-live="polite"
          className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm"
        >
          {success}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={loading || totalEntries === 0} className="btn-primary">
          {loading
            ? "Opslaan..."
            : totalEntries > 1
            ? `Uren opslaan (${totalEntries} registraties)`
            : "Uren opslaan"}
        </button>
        <button type="button" onClick={() => router.back()} className="btn-secondary">
          Annuleren
        </button>
        <span className="text-sm text-gray-500">
          {totalEntries > 0
            ? `${totalEntries} conceptregistratie${totalEntries === 1 ? "" : "s"} worden aangemaakt`
            : "Selecteer deelnemers en werkzaamheden"}
        </span>
      </div>

      <p className="mt-3 text-xs text-gray-400">
        Na opslaan krijgt elke registratie een onveranderbaar tijdstempel (createdAt).
      </p>
    </form>
  );
}
