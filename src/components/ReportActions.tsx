"use client";

export default function ReportActions({ asOf }: { asOf: string }) {
  const reportHoursUrl = `/api/export?type=hours&scope=report&asOf=${encodeURIComponent(asOf)}`;

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-blue-950 shadow-sm transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-900"
      >
        🖨️ Print / bewaar als PDF
      </button>
      <a
        href={reportHoursUrl}
        className="rounded-lg border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white"
      >
        ↓ Uren-CSV t/m {asOf}
      </a>
    </div>
  );
}
