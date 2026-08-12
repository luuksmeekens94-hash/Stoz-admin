import type { MonthlyPlanningApprovalMonth } from "@/components/MonthlyPlanningApprovalBoard";
import { prisma } from "@/lib/prisma";

function monthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

export async function loadMonthlyApprovalMonths(currentMonth: string) {
  const latestVersion = await prisma.planningVersion.findFirst({
    orderBy: { revision: "desc" },
    include: {
      allocations: {
        orderBy: [{ monthStart: "asc" }, { label: "asc" }],
        include: { forecastEntries: { select: { id: true } } },
      },
    },
  });
  if (!latestVersion) return [];

  const grouped = new Map<
    string,
    {
      totalHours: number;
      reviewState: "DRAFT" | "REVIEWED";
      roles: Map<string, { hours: number; detailCount: number }>;
    }
  >();
  for (const allocation of latestVersion.allocations) {
    const key = monthKey(allocation.monthStart);
    if (key < currentMonth) continue;
    const month = grouped.get(key) || {
      totalHours: 0,
      reviewState: "REVIEWED" as const,
      roles: new Map<string, { hours: number; detailCount: number }>(),
    };
    month.totalHours += allocation.plannedHours;
    if (allocation.reviewState === "DRAFT") month.reviewState = "DRAFT";
    const role = month.roles.get(allocation.roleCategory) || { hours: 0, detailCount: 0 };
    role.hours += allocation.plannedHours;
    role.detailCount += allocation.forecastEntries.length;
    month.roles.set(allocation.roleCategory, role);
    grouped.set(key, month);
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, month]): MonthlyPlanningApprovalMonth => ({
      monthKey: key,
      monthLabel: new Date(`${key}-01T00:00:00.000Z`).toLocaleDateString("nl-NL", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
      totalHours: Math.round(month.totalHours * 100) / 100,
      reviewState: month.reviewState,
      roles: Array.from(month.roles.entries())
        .map(([label, role]) => ({
          label,
          hours: Math.round(role.hours * 100) / 100,
          detailCount: role.detailCount,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "nl")),
    }));
}
