import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";

// Monthly targets per person (not linear - weighted by project phase)
// Year 1: more PM, content dev, training. Year 2: more implementation, evaluation
const MONTHLY_TARGETS: Record<string, { total: number; perMonth: number[] }> = {
  // Marion, Sjoerd, Heidi each ~163 hrs over 24 months
  "marion@fysiotherapienijmegen.nl": { total: 163, perMonth: [8,8,8,8,7,7,7,7,6,6,6,6, 7,7,7,7,7,7,6,6,6,6,5,5] },
  "sjoerd@fysiotherapienijmegen.nl": { total: 163, perMonth: [8,8,8,8,7,7,7,7,6,6,6,6, 7,7,7,7,7,7,6,6,6,6,5,5] },
  "heidi@fysiotherapienijmegen.nl":  { total: 164, perMonth: [8,8,8,8,7,7,7,7,6,6,7,7, 7,7,7,7,7,7,7,6,6,6,5,5] },
  // Luuk: 325 hrs, heavier in year 1 (content dev)
  "luuk.smeekens@outlook.com":       { total: 325, perMonth: [16,16,16,15,15,15,14,14,14,13,13,12, 13,13,13,13,13,12,12,11,11,10,10,10] },
  // Websitebouwer: 25 hrs, mostly in months 4-8
  "ltromp@symbiomarketing.nl":       { total: 25, perMonth: [0,0,0,4,5,5,5,4,2,0,0,0, 0,0,0,0,0,0,0,0,0,0,0,0] },
  // Team fysio: 60 hrs, mostly year 1 pilot + year 2 uitrol
  "team@fysiotherapienijmegen.nl":   { total: 60, perMonth: [0,0,0,0,2,3,3,3,3,3,3,3, 3,3,3,3,3,3,3,3,3,3,3,3] },
};

const PROJECT_START = new Date(2025, 8, 1); // Sept 2025

function getProjectMonth(date: Date): number {
  const months = (date.getFullYear() - PROJECT_START.getFullYear()) * 12 + (date.getMonth() - PROJECT_START.getMonth());
  return Math.max(0, Math.min(23, months));
}

function getMonthLabel(monthIndex: number): string {
  const d = new Date(PROJECT_START);
  d.setMonth(d.getMonth() + monthIndex);
  return d.toLocaleDateString("nl-NL", { month: "short", year: "numeric" });
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const user = session.user;
  const isAdmin = user.role === "ADMIN";
  const now = new Date();
  const currentProjectMonth = getProjectMonth(now);

  // Stats
  const whereUser = isAdmin ? {} : { userId: user.id };

  const [totalHours, pendingCount, approvedCount, recentEntries] = await Promise.all([
    prisma.hourEntry.aggregate({ where: whereUser, _sum: { hours: true } }),
    prisma.hourEntry.count({ where: { ...whereUser, status: "SUBMITTED" } }),
    prisma.hourEntry.count({ where: { ...whereUser, status: "APPROVED" } }),
    prisma.hourEntry.findMany({
      where: whereUser,
      orderBy: { date: "desc" },
      take: 5,
      include: { user: true, workPackage: true, activity: true },
    }),
  ]);

  // Per-person monthly progress (admin sees all, others see own)
  const allUsers = isAdmin 
    ? await prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } })
    : [user];

  // Get hours per user grouped by month
  const allHours = await prisma.hourEntry.findMany({
    where: isAdmin ? {} : { userId: user.id },
    select: { userId: true, hours: true, date: true },
  });

  // Build per-user-per-month totals
  const userMonthHours: Record<string, Record<number, number>> = {};
  allHours.forEach(h => {
    if (!userMonthHours[h.userId]) userMonthHours[h.userId] = {};
    const m = getProjectMonth(h.date);
    userMonthHours[h.userId][m] = (userMonthHours[h.userId][m] || 0) + h.hours;
  });

  const adminStats = isAdmin
    ? await Promise.all([
        prisma.invoice.count(),
        prisma.client.count(),
        prisma.training.count(),
      ])
    : [0, 0, 0];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Welkom, {user.name.split(" ")[0]}
        </h1>
        <p className="text-gray-600">
          {isAdmin ? "Overzicht van het hele project" : "Jouw overzicht"} — Maand {currentProjectMonth + 1}/24
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card">
          <p className="text-sm text-gray-500">Totaal uren</p>
          <p className="text-2xl font-bold">{totalHours._sum.hours?.toFixed(1) || "0"}</p>
        </div>
        <Link href="/uren?status=SUBMITTED" className="card hover:shadow-lg transition-shadow">
          <p className="text-sm text-gray-500">Te beoordelen</p>
          <p className="text-2xl font-bold text-orange-600">{pendingCount}</p>
        </Link>
        <div className="card">
          <p className="text-sm text-gray-500">Goedgekeurd</p>
          <p className="text-2xl font-bold text-green-600">{approvedCount}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Projectvoortgang</p>
          <p className="text-2xl font-bold">{Math.round(((currentProjectMonth + 1) / 24) * 100)}%</p>
        </div>
      </div>

      {/* Monthly targets per person */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Maandoverzicht per deelnemer</h2>
          <span className="text-sm text-gray-500">Huidige maand: {getMonthLabel(currentProjectMonth)}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 font-medium text-gray-600">Naam</th>
                <th className="text-right py-2 px-3 font-medium text-gray-600">Streef deze maand</th>
                <th className="text-right py-2 px-3 font-medium text-gray-600">Gerealiseerd</th>
                <th className="text-right py-2 px-3 font-medium text-gray-600">Totaal t/m nu</th>
                <th className="text-right py-2 px-3 font-medium text-gray-600">Streef t/m nu</th>
                <th className="text-right py-2 px-3 font-medium text-gray-600">Budget totaal</th>
                <th className="text-center py-2 px-3 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {allUsers.map(u => {
                const targets = MONTHLY_TARGETS[u.email];
                if (!targets) return null;
                
                const monthTarget = targets.perMonth[currentProjectMonth] || 0;
                const monthActual = userMonthHours[u.id]?.[currentProjectMonth] || 0;
                
                // Cumulative target up to current month
                const cumTarget = targets.perMonth.slice(0, currentProjectMonth + 1).reduce((a, b) => a + b, 0);
                // Cumulative actual
                const cumActual = Object.values(userMonthHours[u.id] || {}).reduce((a, b) => a + b, 0);
                
                const monthPct = monthTarget > 0 ? (monthActual / monthTarget) * 100 : 0;
                const cumPct = cumTarget > 0 ? (cumActual / cumTarget) * 100 : 0;
                
                let statusColor = "bg-red-500";
                let statusText = "Achterstand";
                if (cumPct >= 80) { statusColor = "bg-green-500"; statusText = "Op schema"; }
                else if (cumPct >= 50) { statusColor = "bg-orange-500"; statusText = "Let op"; }

                return (
                  <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-3 font-medium">{u.name}</td>
                    <td className="py-3 px-3 text-right">{monthTarget}u</td>
                    <td className="py-3 px-3 text-right font-semibold">
                      <span className={monthActual >= monthTarget ? "text-green-600" : monthActual > 0 ? "text-orange-600" : "text-red-500"}>
                        {monthActual.toFixed(1)}u
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">{cumActual.toFixed(1)}u</td>
                    <td className="py-3 px-3 text-right text-gray-500">{cumTarget}u</td>
                    <td className="py-3 px-3 text-right text-gray-500">{targets.total}u</td>
                    <td className="py-3 px-3 text-center">
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${
                        statusColor === "bg-green-500" ? "bg-green-100 text-green-700" :
                        statusColor === "bg-orange-500" ? "bg-orange-100 text-orange-700" :
                        "bg-red-100 text-red-700"
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${statusColor}`} />
                        {statusText}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <Link href="/uren/nieuw" className="card hover:shadow-lg transition-shadow text-center">
          <p className="text-2xl mb-2">⏱️</p>
          <p className="font-semibold">Uren registreren</p>
        </Link>
        {isAdmin && (
          <>
            <Link href="/facturen/nieuw" className="card hover:shadow-lg transition-shadow text-center">
              <p className="text-2xl mb-2">📄</p>
              <p className="font-semibold">Factuur toevoegen</p>
            </Link>
            <Link href="/budget" className="card hover:shadow-lg transition-shadow text-center">
              <p className="text-2xl mb-2">💰</p>
              <p className="font-semibold">Budget bekijken</p>
            </Link>
          </>
        )}
      </div>

      {/* Recent entries */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Recente registraties</h2>
        {recentEntries.length === 0 ? (
          <p className="text-gray-500 py-4 text-center">Nog geen uren geregistreerd.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3">Datum</th>
                  {isAdmin && <th className="text-left py-2 px-3">Wie</th>}
                  <th className="text-left py-2 px-3">Werkpakket</th>
                  <th className="text-left py-2 px-3">Activiteit</th>
                  <th className="text-right py-2 px-3">Uren</th>
                  <th className="text-center py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentEntries.map(entry => (
                  <tr key={entry.id} className="border-b border-gray-100">
                    <td className="py-2 px-3">{entry.date.toLocaleDateString("nl-NL")}</td>
                    {isAdmin && <td className="py-2 px-3">{entry.user.name}</td>}
                    <td className="py-2 px-3">{entry.workPackage.code}</td>
                    <td className="py-2 px-3">{entry.activity?.name || "-"}</td>
                    <td className="py-2 px-3 text-right font-medium">{entry.hours}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        entry.status === "APPROVED" ? "bg-green-100 text-green-700" :
                        entry.status === "SUBMITTED" ? "bg-orange-100 text-orange-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        {entry.status === "APPROVED" ? "Goedgekeurd" : entry.status === "SUBMITTED" ? "Ingediend" : "Concept"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Link href="/uren" className="text-blue-600 hover:text-blue-800 text-sm mt-3 inline-block">
          Alle uren bekijken →
        </Link>
      </div>

      {isAdmin && (
        <div className="grid md:grid-cols-3 gap-4 mt-6">
          <div className="card">
            <h3 className="font-semibold mb-2">📄 Facturen</h3>
            <p className="text-2xl font-bold text-gray-700">{adminStats[0]}</p>
            <Link href="/facturen" className="text-blue-600 text-sm">Bekijken →</Link>
          </div>
          <div className="card">
            <h3 className="font-semibold mb-2">🎓 Trainingen</h3>
            <p className="text-2xl font-bold text-gray-700">{adminStats[2]}</p>
            <Link href="/trainingen" className="text-blue-600 text-sm">Bekijken →</Link>
          </div>
          <div className="card">
            <h3 className="font-semibold mb-2">👥 Cliënten</h3>
            <p className="text-2xl font-bold text-gray-700">{adminStats[1]}</p>
            <Link href="/clienten" className="text-blue-600 text-sm">Bekijken →</Link>
          </div>
        </div>
      )}
    </div>
  );
}
