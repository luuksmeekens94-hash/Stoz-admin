import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function BudgetPage() {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard");

  // Get all budget allocations with users
  const allocations = await prisma.budgetAllocation.findMany({
    include: { user: { select: { id: true, name: true } } },
    orderBy: { category: "asc" },
  });

  // Get actual hours per user
  const hoursByUser = await prisma.hourEntry.groupBy({
    by: ["userId"],
    _sum: { hours: true },
  });

  const approvedHoursByUser = await prisma.hourEntry.groupBy({
    by: ["userId"],
    where: { status: "APPROVED" },
    _sum: { hours: true },
  });

  // Map user hours
  const hoursMap: Record<string, number> = {};
  const approvedMap: Record<string, number> = {};
  hoursByUser.forEach((h) => {
    hoursMap[h.userId] = h._sum.hours || 0;
  });
  approvedHoursByUser.forEach((h) => {
    approvedMap[h.userId] = h._sum.hours || 0;
  });

  // Get all therapists with their hourly rates
  const therapists = await prisma.therapist.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  // Get hours per therapist (via therapistId on HourEntry)
  const hoursByTherapist = await prisma.hourEntry.groupBy({
    by: ["therapistId"],
    where: { therapistId: { not: null } },
    _sum: { hours: true },
  });

  const approvedHoursByTherapist = await prisma.hourEntry.groupBy({
    by: ["therapistId"],
    where: { therapistId: { not: null }, status: "APPROVED" },
    _sum: { hours: true },
  });

  const therapistHoursMap: Record<string, number> = {};
  const therapistApprovedMap: Record<string, number> = {};
  hoursByTherapist.forEach((h) => {
    if (h.therapistId) therapistHoursMap[h.therapistId] = h._sum.hours || 0;
  });
  approvedHoursByTherapist.forEach((h) => {
    if (h.therapistId) therapistApprovedMap[h.therapistId] = h._sum.hours || 0;
  });

  // Build therapist cost rows
  const therapistRows = therapists.map((t) => {
    const hours = therapistHoursMap[t.id] || 0;
    const approvedHours = therapistApprovedMap[t.id] || 0;
    const rate = t.hourlyRate || 0;
    const totalCost = hours * rate;
    return { ...t, hours, approvedHours, rate, totalCost };
  });

  const totalTherapistHours = therapistRows.reduce((sum, r) => sum + r.hours, 0);
  const totalTherapistCost = therapistRows.reduce((sum, r) => sum + r.totalCost, 0);

  // Calculate totals
  const totalBudgetHours = allocations.reduce((sum, a) => sum + a.budgetHours, 0);
  const totalBudgetAmount = allocations.reduce(
    (sum, a) => sum + a.budgetHours * a.hourlyRate,
    0
  );
  const totalActualHours = Object.values(hoursMap).reduce((sum, h) => sum + h, 0);

  function getTrafficLight(actual: number, budget: number) {
    if (budget === 0) return { color: "gray", label: "N.v.t." };
    const pct = (actual / budget) * 100;
    if (pct > 100) return { color: "red", label: `${pct.toFixed(0)}%` };
    if (pct >= 80) return { color: "orange", label: `${pct.toFixed(0)}%` };
    return { color: "green", label: `${pct.toFixed(0)}%` };
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Budget Dashboard</h1>
      <p className="text-gray-600 mb-6">
        Project Hybride Begrip — STOZ subsidie: €39.410 / Totale kosten: €80.160
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="card">
          <p className="text-sm text-gray-500">Budget uren</p>
          <p className="text-2xl font-bold">{totalBudgetHours.toFixed(0)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Gerealiseerd</p>
          <p className="text-2xl font-bold text-primary-700">{totalActualHours.toFixed(1)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Budget bedrag</p>
          <p className="text-2xl font-bold">€{totalBudgetAmount.toLocaleString("nl-NL")}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Subsidie</p>
          <p className="text-2xl font-bold text-green-700">€39.410</p>
        </div>
      </div>

      {/* Budget table */}
      <div className="card mb-8">
        <h2 className="text-lg font-semibold mb-4">Budget per categorie</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="py-2 px-3">Categorie</th>
                <th className="py-2 px-3">Persoon</th>
                <th className="py-2 px-3 text-right">Budget uren</th>
                <th className="py-2 px-3 text-right">Tarief</th>
                <th className="py-2 px-3 text-right">Budget €</th>
                <th className="py-2 px-3 text-right">Gerealiseerd</th>
                <th className="py-2 px-3 text-right">Goedgekeurd</th>
                <th className="py-2 px-3 text-right">Resterend</th>
                <th className="py-2 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((alloc) => {
                const actual = alloc.userId ? hoursMap[alloc.userId] || 0 : 0;
                const approved = alloc.userId ? approvedMap[alloc.userId] || 0 : 0;
                const remaining = alloc.budgetHours - actual;
                const light = getTrafficLight(actual, alloc.budgetHours);
                const budgetAmount = alloc.budgetHours * alloc.hourlyRate;

                return (
                  <tr key={alloc.id} className="border-b border-gray-100">
                    <td className="py-2 px-3 font-medium">{alloc.category}</td>
                    <td className="py-2 px-3">{alloc.user?.name || "—"}</td>
                    <td className="py-2 px-3 text-right">{alloc.budgetHours}</td>
                    <td className="py-2 px-3 text-right">
                      {alloc.hourlyRate > 0 ? `€${alloc.hourlyRate}` : "—"}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {budgetAmount > 0 ? `€${budgetAmount.toLocaleString("nl-NL")}` : "—"}
                    </td>
                    <td className="py-2 px-3 text-right">{actual.toFixed(1)}</td>
                    <td className="py-2 px-3 text-right">{approved.toFixed(1)}</td>
                    <td className="py-2 px-3 text-right">
                      {remaining > 0 ? remaining.toFixed(1) : (
                        <span className="text-red-600 font-medium">{remaining.toFixed(1)}</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span
                        className={`inline-block w-4 h-4 rounded-full ${
                          light.color === "green"
                            ? "bg-green-500"
                            : light.color === "orange"
                            ? "bg-orange-500"
                            : light.color === "red"
                            ? "bg-red-500"
                            : "bg-gray-300"
                        }`}
                        title={light.label}
                      />
                      <span className="ml-1 text-xs text-gray-500">{light.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Kosten per fysiotherapeut */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold mb-4">Kosten per fysiotherapeut</h2>
        {therapistRows.length === 0 ? (
          <p className="text-gray-500 text-sm">Geen fysiotherapeuten gevonden.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2 px-3">Fysiotherapeut</th>
                  <th className="py-2 px-3 text-right">Tarief (€/uur)</th>
                  <th className="py-2 px-3 text-right">Totale uren</th>
                  <th className="py-2 px-3 text-right">Goedgekeurde uren</th>
                  <th className="py-2 px-3 text-right">Totale kosten</th>
                </tr>
              </thead>
              <tbody>
                {therapistRows.map((t) => (
                  <tr key={t.id} className="border-b border-gray-100">
                    <td className="py-2 px-3 font-medium">{t.name}</td>
                    <td className="py-2 px-3 text-right">
                      {t.rate > 0 ? `€${t.rate.toFixed(2)}` : "—"}
                    </td>
                    <td className="py-2 px-3 text-right">{t.hours.toFixed(1)}</td>
                    <td className="py-2 px-3 text-right">{t.approvedHours.toFixed(1)}</td>
                    <td className="py-2 px-3 text-right font-medium">
                      {t.rate > 0 ? `€${t.totalCost.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 font-semibold">
                  <td className="py-2 px-3" colSpan={2}>Totaal team</td>
                  <td className="py-2 px-3 text-right">{totalTherapistHours.toFixed(1)}</td>
                  <td className="py-2 px-3 text-right"></td>
                  <td className="py-2 px-3 text-right">
                    €{totalTherapistCost.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 flex gap-6 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> &lt;80%
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-orange-500 inline-block" /> 80-100%
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> &gt;100%
        </span>
      </div>
    </div>
  );
}
