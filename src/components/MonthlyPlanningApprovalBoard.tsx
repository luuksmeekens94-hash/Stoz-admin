"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface MonthlyPlanningApprovalRole {
  label: string;
  hours: number;
  detailCount: number;
}

export interface MonthlyPlanningApprovalMonth {
  monthKey: string;
  monthLabel: string;
  totalHours: number;
  reviewState: "DRAFT" | "REVIEWED";
  roles: MonthlyPlanningApprovalRole[];
}

function formatHours(value: number) {
  return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(value)} uur`;
}

export default function MonthlyPlanningApprovalBoard({
  months,
}: {
  months: MonthlyPlanningApprovalMonth[];
}) {
  const router = useRouter();
  const [savingMonth, setSavingMonth] = useState("");
  const [error, setError] = useState("");

  async function approveMonth(month: MonthlyPlanningApprovalMonth) {
    setSavingMonth(month.monthKey);
    setError("");
    try {
      const response = await fetch(`/api/planning/months/${month.monthKey}`, { method: "PATCH" });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error || "Planmaand goedkeuren mislukt.");
        return;
      }
      router.refresh();
    } catch {
      setError("Verbindingsfout bij het goedkeuren van de planmaand.");
    } finally {
      setSavingMonth("");
    }
  }

  const pending = months.filter((month) => month.reviewState === "DRAFT");
  const reviewed = months.filter((month) => month.reviewState === "REVIEWED");

  return (
    <section className="card border-blue-200 bg-blue-50/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-blue-950">Maandelijks uren klaarzetten en goedkeuren</h2>
          <p className="mt-1 text-sm text-blue-900">
            Controleer de uren per functie. Met één knop keur je alle concrete forecastregels van de maand goed.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-800">{pending.length} te beoordelen</span>
          <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-800">{reviewed.length} goedgekeurd</span>
        </div>
      </div>

      {error && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {months.map((month) => (
          <article key={month.monthKey} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold capitalize text-gray-900">{month.monthLabel}</h3>
                <p className="text-sm text-gray-500">{formatHours(month.totalHours)} totaal</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                month.reviewState === "REVIEWED"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }`}>
                {month.reviewState === "REVIEWED" ? "Goedgekeurd" : "Klaar voor controle"}
              </span>
            </div>

            <div className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-100">
              {month.roles.map((role) => (
                <div key={role.label} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium text-gray-800">{role.label}</div>
                    <div className="text-xs text-gray-500">{role.detailCount} datumregel{role.detailCount === 1 ? "" : "s"}</div>
                  </div>
                  <div className="font-semibold text-gray-900">{formatHours(role.hours)}</div>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="btn-primary mt-4 w-full"
              disabled={month.reviewState === "REVIEWED" || savingMonth === month.monthKey}
              onClick={() => approveMonth(month)}
              aria-label={`${month.monthLabel} goedkeuren`}
            >
              {month.reviewState === "REVIEWED"
                ? "Maand goedgekeurd"
                : savingMonth === month.monthKey
                  ? "Goedkeuren…"
                  : "Deze maand goedkeuren"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
