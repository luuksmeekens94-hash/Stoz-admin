import { getSession } from "@/lib/auth";
import { PROJECT_STEERING_CONFIG } from "@/lib/project-plan";
import { prisma } from "@/lib/prisma";
import InterimHoursDashboard from "@/components/InterimHoursDashboard";
import {
  loadInterimHoursSteering,
  loadPreparedInterimProposalKeys,
} from "@/lib/interim-hour-steering-db";
import { loadMonthlyApprovalMonths } from "@/lib/monthly-planning-db";
import { amsterdamDateKey, resolveReportAsOf } from "@/lib/reporting-control";
import { redirect } from "next/navigation";
import Link from "next/link";

function hours(value: number | null | undefined) {
  return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(value || 0)} u`;
}

function dateLabel(value: string) {
  return new Date(`${value}T12:00:00.000Z`).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Amsterdam",
  });
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const user = session.user;
  const isAdmin = user.role === "ADMIN";
  if (isAdmin) {
    const today = amsterdamDateKey();
    const asOf = resolveReportAsOf({
      today,
      periodEnd: PROJECT_STEERING_CONFIG.reportPeriodEnd,
    });
    const [steering, preparedProposalKeys, months] = await Promise.all([
      loadInterimHoursSteering(asOf),
      loadPreparedInterimProposalKeys(asOf),
      loadMonthlyApprovalMonths(today.slice(0, 7)),
    ]);
    return (
      <InterimHoursDashboard
        asOf={asOf}
        steering={steering}
        preparedProposalKeys={preparedProposalKeys}
        months={months}
      />
    );
  }
  const now = new Date();
  const whereUser = isAdmin ? {} : { userId: user.id };

  const [enteredPast, reportableHours, pendingCount, futureHours, recentEntries, adminStats] =
    await Promise.all([
      prisma.hourEntry.aggregate({
        where: { ...whereUser, date: { lte: now } },
        _sum: { hours: true },
      }),
      prisma.hourEntry.aggregate({
        where: { ...whereUser, date: { lte: now }, status: "APPROVED" },
        _sum: { hours: true },
      }),
      prisma.hourEntry.count({
        where: { ...whereUser, date: { lte: now }, status: "SUBMITTED" },
      }),
      prisma.hourEntry.aggregate({
        where: { ...whereUser, date: { gt: now } },
        _sum: { hours: true },
      }),
      prisma.hourEntry.findMany({
        where: whereUser,
        orderBy: { createdAt: "desc" },
        take: 7,
        include: { user: true, therapist: true, workPackage: true, activity: true },
      }),
      isAdmin
        ? Promise.all([
            prisma.invoice.count(),
            prisma.client.count(),
            prisma.training.count(),
          ])
        : Promise.resolve([0, 0, 0]),
    ]);

  const futureTotal = futureHours._sum.hours || 0;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-br from-slate-950 via-blue-950 to-primary-800 p-6 text-white shadow-lg">
        <p className="text-sm text-blue-200">Hybride Begrip</p>
        <h1 className="mt-1 text-3xl font-bold">Welkom, {user.name.split(" ")[0]}</h1>
        <p className="mt-2 max-w-3xl text-blue-100">
          {isAdmin
            ? `Eerste STOZ-verslagperiode: ${dateLabel(PROJECT_STEERING_CONFIG.reportPeriodStart)} t/m ${dateLabel(PROJECT_STEERING_CONFIG.reportPeriodEnd)}.`
            : "Bekijk en registreer jouw uren voor het STOZ-project."}
        </p>
        {isAdmin && (
          <Link href="/urensturing" className="mt-5 inline-flex rounded-lg bg-white px-4 py-2 text-sm font-semibold text-blue-950 shadow-sm hover:bg-blue-50">
            Open voortgangs- en financieel dossier →
          </Link>
        )}
      </section>

      {isAdmin && (
        <section>
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-700">Werk in drie stappen</p>
            <h2 className="text-2xl font-bold text-gray-950">Voortgangsrapportage en maandsturing</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Link href="/urensturing#inhoudelijk" className="card border-t-4 border-t-blue-700 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="flex items-center justify-between"><span className="text-sm font-bold text-blue-800">STAP 1</span><span className="text-2xl">📝</span></div>
              <h3 className="mt-3 text-lg font-semibold">Inhoudelijk voortgangsverslag</h3>
              <p className="mt-2 text-sm text-gray-600">Bekijk de verwerkte projectduiding en werk samen met Grote Speler het Model D-concept af.</p>
              <span className="mt-4 inline-block font-semibold text-blue-700">Open inhoudelijk dossier →</span>
            </Link>
            <Link href="/uren/reconstructie" className="card border-t-4 border-t-amber-600 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="flex items-center justify-between"><span className="text-sm font-bold text-amber-800">STAP 2</span><span className="text-2xl">💶</span></div>
              <h3 className="mt-3 text-lg font-semibold">Financieel voortgangsverslag</h3>
              <p className="mt-2 text-sm text-gray-600">Zet de bevestigde ontbrekende uren klaar, vul de datum in en actualiseer daarna het Model B-concept.</p>
              <span className="mt-4 inline-block font-semibold text-amber-700">Uren aanvullen →</span>
            </Link>
            <Link href="/urenplanning" className="card border-t-4 border-t-emerald-600 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="flex items-center justify-between"><span className="text-sm font-bold text-emerald-800">STAP 3</span><span className="text-2xl">📅</span></div>
              <h3 className="mt-3 text-lg font-semibold">Maandelijkse uren klaarzetten</h3>
              <p className="mt-2 text-sm text-gray-600">Controleer de verwachte uren per functie en keur de maand met één knop goed.</p>
              <span className="mt-4 inline-block font-semibold text-emerald-700">Open maandplanning →</span>
            </Link>
          </div>
        </section>
      )}

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card border-l-4 border-l-primary-600">
          <p className="text-sm text-gray-500">Rapportageklare uren</p>
          <p className="mt-1 text-2xl font-bold">{hours(reportableHours._sum.hours)}</p>
          <p className="mt-1 text-xs text-gray-500">goedgekeurd en t/m vandaag</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Alle uren t/m vandaag</p>
          <p className="mt-1 text-2xl font-bold">{hours(enteredPast._sum.hours)}</p>
          <p className="mt-1 text-xs text-gray-500">incl. concept / ingediend</p>
        </div>
        <Link href="/uren?status=SUBMITTED" className="card transition-shadow hover:shadow-lg">
          <p className="text-sm text-gray-500">Te beoordelen</p>
          <p className="mt-1 text-2xl font-bold text-orange-700">{pendingCount}</p>
          <p className="mt-1 text-xs text-gray-500">verstreken uurregels</p>
        </Link>
        <div className={`card ${futureTotal > 0 ? "border-amber-200 bg-amber-50" : ""}`}>
          <p className="text-sm text-gray-500">Toekomstig gedateerd</p>
          <p className={`mt-1 text-2xl font-bold ${futureTotal > 0 ? "text-amber-800" : ""}`}>{hours(futureTotal)}</p>
          <p className="mt-1 text-xs text-gray-500">telt niet als realisatie</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Link href="/uren/nieuw" className="card text-center transition-shadow hover:shadow-lg">
          <p className="mb-2 text-2xl">⏱️</p>
          <p className="font-semibold">Uren registreren</p>
        </Link>
        {isAdmin && (
          <>
            <Link href="/facturen/nieuw" className="card text-center transition-shadow hover:shadow-lg">
              <p className="mb-2 text-2xl">📄</p>
              <p className="font-semibold">Factuur toevoegen</p>
            </Link>
            <Link href="/urensturing#financieel" className="card text-center transition-shadow hover:shadow-lg">
              <p className="mb-2 text-2xl">🧭</p>
              <p className="font-semibold">Begroting en voortgang</p>
            </Link>
          </>
        )}
      </section>

      <section className="card">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Recent ingevoerd</h2>
            <p className="text-sm text-gray-500">Gesorteerd op invoermoment; een toekomstige datum wordt expliciet gemarkeerd.</p>
          </div>
          <Link href="/uren" className="text-sm font-medium text-blue-700 hover:text-blue-900">Alle uren →</Link>
        </div>
        {recentEntries.length === 0 ? (
          <p className="py-6 text-center text-gray-500">Nog geen uren geregistreerd.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2">Datum</th>
                  {isAdmin && <th className="px-3 py-2">Wie</th>}
                  <th className="px-3 py-2">Werkpakket</th>
                  <th className="px-3 py-2">Activiteit</th>
                  <th className="px-3 py-2 text-right">Uren</th>
                  <th className="px-3 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentEntries.map((entry) => {
                  const isFuture = entry.date > now;
                  return (
                    <tr key={entry.id} className="border-b border-gray-100">
                      <td className="px-3 py-3">
                        {entry.date.toLocaleDateString("nl-NL")}
                        {isFuture && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">toekomst</span>}
                      </td>
                      {isAdmin && <td className="px-3 py-3">{entry.therapist?.name || entry.user.name}</td>}
                      <td className="px-3 py-3">{entry.workPackage.code}</td>
                      <td className="px-3 py-3">{entry.activity?.name || "-"}</td>
                      <td className="px-3 py-3 text-right font-medium">{hours(entry.hours)}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`rounded-full px-2 py-1 text-xs ${
                          entry.status === "APPROVED"
                            ? "bg-green-100 text-green-700"
                            : entry.status === "SUBMITTED"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-gray-100 text-gray-600"
                        }`}>
                          {entry.status === "APPROVED" ? "Goedgekeurd" : entry.status === "SUBMITTED" ? "Ingediend" : "Concept"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isAdmin && (
        <section className="grid gap-4 md:grid-cols-3">
          <Link href="/facturen" className="card hover:shadow-lg"><h3 className="font-semibold">📄 Facturen</h3><p className="mt-2 text-2xl font-bold text-gray-700">{adminStats[0]}</p><p className="text-sm text-blue-700">Bekijken →</p></Link>
          <Link href="/trainingen" className="card hover:shadow-lg"><h3 className="font-semibold">🎓 Trainingen</h3><p className="mt-2 text-2xl font-bold text-gray-700">{adminStats[2]}</p><p className="text-sm text-blue-700">Bekijken →</p></Link>
          <Link href="/clienten" className="card hover:shadow-lg"><h3 className="font-semibold">👥 Cliënten</h3><p className="mt-2 text-2xl font-bold text-gray-700">{adminStats[1]}</p><p className="text-sm text-blue-700">Bekijken →</p></Link>
        </section>
      )}
    </div>
  );
}
