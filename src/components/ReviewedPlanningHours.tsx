"use client";

import Link from "next/link";
import { useState } from "react";

export interface ReviewedPlanningHourRow {
  id: string;
  plannedDate: string;
  executorName: string;
  plannedHours: number;
  note: string | null;
  workPackageCode: string;
  activityCode: string;
  activityName: string;
  monthLabel: string;
}

function formatHours(value: number) {
  return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(value)} uur`;
}

export default function ReviewedPlanningHours({ rows }: { rows: ReviewedPlanningHourRow[] }) {
  const [open, setOpen] = useState(true);
  if (rows.length === 0) return null;

  return (
    <section className="card mb-6 border-blue-200 bg-blue-50/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-blue-950">Goedgekeurde planning</h2>
          <p className="mt-1 text-sm text-blue-900">
            Deze planning is goedgekeurd als werkverwachting en telt niet mee als werkelijk gewerkt.
          </p>
        </div>
        <button
          type="button"
          className="text-sm font-semibold text-blue-800 hover:underline"
          onClick={() => setOpen((value) => !value)}
          aria-label={`Goedgekeurde planning ${open ? "inklappen" : "uitklappen"}`}
          aria-expanded={open}
        >
          {open ? "Inklappen" : "Uitklappen"}
        </button>
      </div>

      {open && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-blue-100 bg-white">
          <table className="w-full text-sm">
            <caption className="sr-only">Goedgekeurde planning die nog als werkelijke uren bevestigd moet worden</caption>
            <thead>
              <tr className="border-b border-blue-100 bg-blue-50/60 text-left">
                <th className="px-3 py-2">Datum</th>
                <th className="px-3 py-2">Persoon</th>
                <th className="px-3 py-2">Werkzaamheid</th>
                <th className="px-3 py-2 text-right">Uren</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actie</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-blue-50 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2">
                    {new Date(`${row.plannedDate}T00:00:00.000Z`).toLocaleDateString("nl-NL", { timeZone: "UTC" })}
                    <span className="block text-xs text-gray-500 capitalize">{row.monthLabel}</span>
                  </td>
                  <td className="px-3 py-2 font-medium">{row.executorName}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{row.workPackageCode}/{row.activityCode} · {row.activityName}</span>
                    {row.note && <span className="block max-w-xl text-xs text-gray-500">{row.note}</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">{formatHours(row.plannedHours)}</td>
                  <td className="px-3 py-2"><span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800">Gepland</span></td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <Link href={`/uren/nieuw?forecastEntryId=${encodeURIComponent(row.id)}`} className="font-semibold text-primary-700 hover:underline">
                      Na uitvoering registreren
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
