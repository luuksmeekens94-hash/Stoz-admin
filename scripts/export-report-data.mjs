import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";

const prisma = new PrismaClient();
const AS_OF = "2026-08-11";
const asOfEnd = new Date(`${AS_OF}T23:59:59.999Z`);

function round(value) {
  return Math.round(value * 100) / 100;
}

function sum(values) {
  return round(values.reduce((total, value) => total + value, 0));
}

async function main() {
  const privateConfigUrl = new URL("../documents/concepten/report-config.private.json", import.meta.url);
  const privateConfig = JSON.parse(await readFile(privateConfigUrl, "utf8"));
  if (
    !Array.isArray(privateConfig.internalCostUsers)
    || privateConfig.internalCostUsers.length === 0
    || privateConfig.internalCostUsers.some((name) => typeof name !== "string" || name.trim().length < 2)
  ) {
    throw new Error("Privérapportconfiguratie mist internalCostUsers.");
  }
  const [entries, invoices, trainings, clientCount, surveyResponseCount, forecastEntryCount, activities, workPackages] = await Promise.all([
    prisma.hourEntry.findMany({
      where: { status: "APPROVED", date: { lte: asOfEnd } },
      include: { user: true, therapist: true, workPackage: true, activity: true },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    prisma.invoice.findMany({ where: { date: { lte: asOfEnd } }, orderBy: { date: "asc" } }),
    prisma.training.findMany({
      where: { date: { lte: asOfEnd } },
      include: { attendees: true },
      orderBy: { date: "asc" },
    }),
    prisma.client.count({ where: { startDate: { lte: asOfEnd } } }),
    prisma.surveyResponse.count({ where: { submittedAt: { lte: asOfEnd } } }),
    prisma.forecastEntry.count(),
    prisma.activity.findMany({ include: { workPackage: true }, orderBy: { code: "asc" } }),
    prisma.workPackage.findMany({ orderBy: { code: "asc" } }),
  ]);

  const payload = {
    generatedAt: new Date().toISOString(),
    asOf: AS_OF,
    caseReference: "STOZ25-03851282",
    projectName: "Hybride Begrip",
    applicant: "Fysiotherapie Fy-fit",
    reportPeriod: { start: "2025-09-01", end: "2026-08-31" },
    actualProjectStart: "2026-03-01",
    projectEnd: "2027-09-01",
    approvedEligibleCosts: 78820,
    approvedSubsidy: 39410,
    reportConfig: {
      internalCostUsers: privateConfig.internalCostUsers.map((name) => name.trim()),
    },
    entries: entries.map((entry) => ({
      id: entry.id,
      date: entry.date.toISOString().slice(0, 10),
      hours: entry.hours,
      user: entry.user.name,
      therapist: entry.therapist?.name || null,
      workPackage: entry.workPackage.code,
      activity: entry.activity.code,
      description: entry.description,
    })),
    invoices: invoices.map((invoice) => ({
      number: invoice.invoiceNumber,
      date: invoice.date.toISOString().slice(0, 10),
      supplier: invoice.supplier,
      description: invoice.description,
      amountExVat: invoice.amountExVat,
      vatAmount: invoice.vatAmount,
      amountIncVat: invoice.amountIncVat,
      paymentDate: invoice.paymentDate?.toISOString().slice(0, 10) || null,
      confirmedBudgetLineId: invoice.confirmedBudgetLineId,
      vatTreatment: invoice.vatTreatment,
      hasEvidence: Boolean(invoice.fileData && invoice.fileName),
    })),
    trainings: trainings.map((training) => ({
      date: training.date.toISOString().slice(0, 10),
      title: training.name,
      hours: training.hours,
      presentAttendees: training.attendees.filter((attendee) => attendee.present).map((attendee) => attendee.name),
    })),
    clientCount,
    surveyResponseCount,
    forecastEntryCount,
    workPackages: workPackages.map((workPackage) => ({ code: workPackage.code, name: workPackage.name })),
    activities: activities.map((activity) => ({
      code: activity.code,
      name: activity.name,
      workPackage: activity.workPackage.code,
    })),
    totals: {
      approvedHours: sum(entries.map((entry) => entry.hours)),
      invoiceExVat: sum(invoices.map((invoice) => invoice.amountExVat)),
      invoiceVat: sum(invoices.map((invoice) => invoice.vatAmount)),
      invoiceIncVat: sum(invoices.map((invoice) => invoice.amountIncVat)),
    },
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main().finally(() => prisma.$disconnect());
