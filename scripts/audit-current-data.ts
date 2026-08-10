import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [hours, budgets, invoices, trainings, clients, workPackages] = await Promise.all([
    prisma.hourEntry.findMany({
      include: { user: true, therapist: true, workPackage: true, activity: true },
      orderBy: { date: "asc" },
    }),
    prisma.budgetAllocation.findMany({ include: { user: true }, orderBy: { category: "asc" } }),
    prisma.invoice.findMany({ include: { workPackage: true }, orderBy: { date: "asc" } }),
    prisma.training.findMany({ include: { attendees: true }, orderBy: { date: "asc" } }),
    prisma.client.findMany({ orderBy: { startDate: "asc" } }),
    prisma.workPackage.findMany({ include: { activities: true }, orderBy: { code: "asc" } }),
  ]);

  const add = (map: Record<string, number>, key: string, value: number) => {
    map[key] = Math.round(((map[key] || 0) + value) * 100) / 100;
  };
  const byStatus: Record<string, number> = {};
  const byUser: Record<string, number> = {};
  const byWp: Record<string, number> = {};
  const byActivity: Record<string, number> = {};
  const byMonth: Record<string, number> = {};
  for (const row of hours) {
    add(byStatus, row.status, row.hours);
    add(byUser, row.therapist?.name || row.user.name, row.hours);
    add(byWp, row.workPackage.code, row.hours);
    add(byActivity, `${row.activity.code} ${row.activity.name}`, row.hours);
    add(byMonth, row.date.toISOString().slice(0, 7), row.hours);
  }

  console.log(JSON.stringify({
    counts: {
      hours: hours.length,
      invoices: invoices.length,
      trainings: trainings.length,
      clients: clients.length,
    },
    hourTotals: {
      total: Math.round(hours.reduce((sum, row) => sum + row.hours, 0) * 100) / 100,
      byStatus,
      byUser,
      byWp,
      byActivity,
      byMonth,
      dateRange: hours.length ? [hours[0].date.toISOString().slice(0, 10), hours.at(-1)?.date.toISOString().slice(0, 10)] : null,
    },
    budgets: budgets.map((row) => ({
      category: row.category,
      user: row.user?.name || null,
      budgetHours: row.budgetHours,
      hourlyRate: row.hourlyRate,
      description: row.description,
    })),
    invoices: invoices.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      supplier: row.supplier,
      invoiceNumber: row.invoiceNumber,
      amountExVat: row.amountExVat,
      amountIncVat: row.amountIncVat,
      paymentDate: row.paymentDate?.toISOString().slice(0, 10) || null,
      workPackage: row.workPackage.code,
      hasEvidence: Boolean(row.fileData || row.filePath),
    })),
    trainings: trainings.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      name: row.name,
      attendees: row.attendees.length,
      present: row.attendees.filter((attendee) => attendee.present).length,
    })),
    clients: clients.map((row) => ({
      startDate: row.startDate.toISOString().slice(0, 10),
      tool: row.toolUsed,
      active: !row.endDate,
    })),
    workPackages: workPackages.map((row) => ({
      code: row.code,
      name: row.name,
      activities: row.activities.map((activity) => ({ code: activity.code, name: activity.name })),
    })),
  }, null, 2));
}

main().finally(() => prisma.$disconnect());
