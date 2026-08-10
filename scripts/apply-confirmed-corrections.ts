import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

function dayKey(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

async function main() {
  const actor = await prisma.user.findFirst({
    where: { role: "ADMIN", active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  if (!actor) throw new Error("Geen actieve beheerder gevonden voor het auditspoor.");

  const invoiceTargets: Record<string, string> = {
    "67": "2026-04-08",
    "71": "2026-05-08",
  };
  const invoices = await prisma.invoice.findMany({
    where: { invoiceNumber: { in: Object.keys(invoiceTargets) } },
    orderBy: { invoiceNumber: "asc" },
  });

  const invoiceActions = invoices.map((invoice) => {
    const target = invoiceTargets[invoice.invoiceNumber];
    const current = dayKey(invoice.paymentDate);
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      current,
      target,
      action: current === target ? "ALREADY_CORRECT" : current === null ? "SET_PAYMENT_DATE" : "BLOCKED_DIFFERENT_VALUE",
    };
  });

  const training = await prisma.training.findFirst({
    where: { date: new Date("2026-03-05T00:00:00.000Z") },
    include: { attendees: { where: { present: true }, orderBy: { name: "asc" } } },
  });
  const trainingEntries = await prisma.hourEntry.findMany({
    where: {
      status: "APPROVED",
      date: new Date("2026-03-09T00:00:00.000Z"),
      workPackage: { code: "WP3" },
    },
    include: { therapist: true, user: true },
    orderBy: { therapist: { name: "asc" } },
  });
  const bramFutureRows = await prisma.hourEntry.findMany({
    where: {
      status: "APPROVED",
      date: new Date("2026-09-09T00:00:00.000Z"),
      therapist: { name: "Bram Heldens" },
    },
    include: { activity: true },
  });

  console.log(
    JSON.stringify(
      {
        mode: apply ? "APPLY" : "DRY_RUN",
        invoiceActions,
        trainingReconciliation: {
          trainingDate: training ? dayKey(training.date) : null,
          presentNames: training?.attendees.map((attendee) => attendee.name) ?? [],
          hourEntryActors: trainingEntries.map((entry) => entry.therapist?.name ?? entry.user.name),
          automaticCorrection: "BLOCKED_PENDING_NAME_RECONCILIATION",
        },
        bramDateCorrection: {
          rows: bramFutureRows.map((entry) => ({ id: entry.id, hours: entry.hours, activity: entry.activity.code })),
          automaticCorrection: "BLOCKED_PENDING_CORRECT_DATE",
        },
      },
      null,
      2
    )
  );

  if (!apply) return;

  for (const action of invoiceActions) {
    if (action.action === "ALREADY_CORRECT") continue;
    if (action.action !== "SET_PAYMENT_DATE") {
      throw new Error(`Factuur ${action.invoiceNumber} heeft al een afwijkende betaaldatum.`);
    }

    await prisma.$transaction(async (tx) => {
      const before = { paymentDate: action.current };
      const after = { paymentDate: action.target };
      await tx.auditEvent.create({
        data: {
          entityType: "Invoice",
          entityId: action.id,
          action: "CONFIRMED_PAYMENT_DATE",
          reason: `Door Luuk bevestigd: betaald zeven dagen na factuurdatum; factuur ${action.invoiceNumber}.`,
          beforeData: before as Prisma.InputJsonValue,
          afterData: after as Prisma.InputJsonValue,
          actorUserId: actor.id,
        },
      });
      await tx.invoice.update({
        where: { id: action.id },
        data: { paymentDate: new Date(`${action.target}T00:00:00.000Z`) },
      });
    });
  }

  console.log(`Toegepast door ${actor.email}: ${invoiceActions.filter((row) => row.action === "SET_PAYMENT_DATE").length} betaaldatumcorrecties.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
