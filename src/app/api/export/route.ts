import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { getSession } from "@/lib/auth";
import { sanitizeCsvRows } from "@/lib/csv-export";
import { hasValidInvoiceAmounts, hasValidInvoiceBudgetLineMapping, hasValidInvoiceEvidence } from "@/lib/financial-steering";
import { APPROVED_BUDGET_LINES, PROJECT_STEERING_CONFIG } from "@/lib/project-plan";
import { prisma } from "@/lib/prisma";
import { amsterdamDateKey, reportCutoffEnd, resolveReportExportAsOf } from "@/lib/reporting-control";

function csvResponse(data: Record<string, unknown>[], filename: string) {
  const csv = Papa.unparse(sanitizeCsvRows(data), { delimiter: ";" });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "hours";
  const scope = searchParams.get("scope");
  if (scope && scope !== "report") {
    return NextResponse.json({ error: "Onbekende exportscope" }, { status: 400 });
  }

  let reportAsOf: string | null = null;
  if (scope === "report") {
    try {
      reportAsOf = resolveReportExportAsOf({
        requestedAsOf: searchParams.get("asOf"),
        today: amsterdamDateKey(),
        periodEnd: PROJECT_STEERING_CONFIG.reportPeriodEnd,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Ongeldige exportpeildatum" },
        { status: 400 },
      );
    }
  }
  const cutoffEnd = reportAsOf ? reportCutoffEnd(reportAsOf) : null;
  const fileSuffix = reportAsOf ? `rapport-tm-${reportAsOf}` : new Date().toISOString().slice(0, 10);

  if (type === "hours") {
    const entries = await prisma.hourEntry.findMany({
      where: reportAsOf
        ? { status: "APPROVED", date: { lte: cutoffEnd! } }
        : undefined,
      orderBy: { date: "asc" },
      include: {
        user: { select: { name: true, email: true } },
        therapist: { select: { name: true } },
        workPackage: true,
        activity: true,
      },
    });

    const data = entries.map((entry) => ({
      Peildatum: reportAsOf || "Alle historie",
      Datum: entry.date.toLocaleDateString("nl-NL", { timeZone: "UTC" }),
      Persoon: entry.therapist?.name || entry.user.name,
      Registratieaccount: entry.user.name,
      Email: entry.user.email,
      Werkpakket: `${entry.workPackage.code}: ${entry.workPackage.name}`,
      Activiteit: `${entry.activity.code}: ${entry.activity.name}`,
      Omschrijving: entry.description,
      Uren: entry.hours,
      Status:
        entry.status === "APPROVED"
          ? "Goedgekeurd"
          : entry.status === "SUBMITTED"
            ? "Ingediend"
            : "Concept",
      Rapportagestatus: reportAsOf ? "Rapportabel t/m peildatum" : "Administratief record",
      "Goedgekeurd op": entry.approvedAt?.toLocaleString("nl-NL") || "",
      "Aangemaakt op": entry.createdAt.toLocaleString("nl-NL"),
    }));

    return csvResponse(data, `uren-export-${fileSuffix}.csv`);
  }

  if (type === "invoices") {
    const invoices = await prisma.invoice.findMany({
      where: reportAsOf ? { date: { lte: cutoffEnd! } } : undefined,
      orderBy: { date: "asc" },
      include: {
        workPackage: true,
        uploadedBy: { select: { name: true } },
      },
    });

    const data = invoices.map((invoice) => {
      const hasEvidence = hasValidInvoiceEvidence(invoice);
      const validAmounts = hasValidInvoiceAmounts({
        id: invoice.id,
        supplier: invoice.supplier,
        amountExVat: invoice.amountExVat,
        vatAmount: invoice.vatAmount,
        amountIncVat: invoice.amountIncVat,
        hasEvidence,
      });
      const validMapping = hasValidInvoiceBudgetLineMapping(
        { ...invoice, hasEvidence, workPackageCode: invoice.workPackage.code },
        APPROVED_BUDGET_LINES,
      );
      const financiallyReportable = Boolean(
        validMapping &&
          hasEvidence &&
          validAmounts &&
          invoice.vatTreatment !== "PENDING",
      );
      return {
        Peildatum: reportAsOf || "Alle historie",
        Datum: invoice.date.toLocaleDateString("nl-NL", { timeZone: "UTC" }),
        Leverancier: invoice.supplier,
        Factuurnummer: invoice.invoiceNumber,
        Werkpakket: `${invoice.workPackage.code}: ${invoice.workPackage.name}`,
        Omschrijving: invoice.description,
        "Bedrag ex. btw": invoice.amountExVat,
        BTW: invoice.vatAmount,
        "Bedrag incl. btw": invoice.amountIncVat,
        Bedragcontrole: validAmounts ? "Geldig" : "Geblokkeerd: bedragen inconsistent",
        Begrotingsregel: validMapping ? invoice.confirmedBudgetLineId : "Niet geldig bevestigd",
        Btwbehandeling: invoice.vatTreatment,
        Bewijs: hasEvidence ? "Aanwezig" : "Ontbreekt",
        Rapportagestatus: financiallyReportable
          ? "Financieel herleidbaar"
          : "Geblokkeerd / te classificeren",
        Classificatiereden: invoice.classificationReason || "",
        Classificatiedatum: invoice.classifiedAt?.toLocaleString("nl-NL") || "",
        Betaaldatum:
          invoice.paymentDate?.toLocaleDateString("nl-NL", { timeZone: "UTC" }) || "",
        "Geüpload door": invoice.uploadedBy.name,
        "Aangemaakt op": invoice.createdAt.toLocaleString("nl-NL"),
      };
    });

    return csvResponse(data, `facturen-export-${fileSuffix}.csv`);
  }

  if (type === "clients") {
    const clients = await prisma.client.findMany({
      where: reportAsOf ? { startDate: { lte: cutoffEnd! } } : undefined,
      orderBy: { startDate: "asc" },
    });
    const data = clients.map((client) => ({
      Peildatum: reportAsOf || "Alle historie",
      Cliëntcode: client.clientCode,
      Tool: client.toolUsed,
      Startdatum: client.startDate.toLocaleDateString("nl-NL", { timeZone: "UTC" }),
      Einddatum:
        client.endDate?.toLocaleDateString("nl-NL", { timeZone: "UTC" }) || "Actief",
      Notities: client.notes || "",
      "Aangemaakt op": client.createdAt.toLocaleString("nl-NL"),
    }));
    return csvResponse(data, `clienten-export-${fileSuffix}.csv`);
  }

  if (type === "trainings") {
    const trainings = await prisma.training.findMany({
      where: reportAsOf ? { date: { lte: cutoffEnd! } } : undefined,
      orderBy: { date: "asc" },
      include: { attendees: true },
    });
    const data = trainings.flatMap((training) =>
      training.attendees.map((attendee) => ({
        Peildatum: reportAsOf || "Alle historie",
        Training: training.name,
        Datum: training.date.toLocaleDateString("nl-NL", { timeZone: "UTC" }),
        Uren: training.hours,
        Onderwerp: training.topic,
        Deelnemer: attendee.name,
        Aanwezig: attendee.present ? "Ja" : "Nee",
        "Aangemaakt op": training.createdAt.toLocaleString("nl-NL"),
      })),
    );
    return csvResponse(data, `trainingen-export-${fileSuffix}.csv`);
  }

  return NextResponse.json({ error: "Onbekend exporttype" }, { status: 400 });
}
