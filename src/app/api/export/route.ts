import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Papa from "papaparse";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "hours";

  if (type === "hours") {
    const entries = await prisma.hourEntry.findMany({
      orderBy: { date: "asc" },
      include: {
        user: { select: { name: true, email: true } },
        workPackage: true,
        activity: true,
      },
    });

    const data = entries.map((e) => ({
      Datum: new Date(e.date).toLocaleDateString("nl-NL"),
      Persoon: e.user.name,
      Email: e.user.email,
      Werkpakket: `${e.workPackage.code}: ${e.workPackage.name}`,
      Activiteit: `${e.activity.code}: ${e.activity.name}`,
      Omschrijving: e.description,
      Uren: e.hours,
      Status: e.status === "APPROVED" ? "Goedgekeurd" : e.status === "SUBMITTED" ? "Ingediend" : "Concept",
      "Goedgekeurd op": e.approvedAt ? new Date(e.approvedAt).toLocaleString("nl-NL") : "",
      "Aangemaakt op": new Date(e.createdAt).toLocaleString("nl-NL"),
    }));

    const csv = Papa.unparse(data, { delimiter: ";" });
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="uren-export-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  }

  if (type === "invoices") {
    const invoices = await prisma.invoice.findMany({
      orderBy: { date: "asc" },
      include: {
        workPackage: true,
        uploadedBy: { select: { name: true } },
      },
    });

    const data = invoices.map((inv) => ({
      Datum: new Date(inv.date).toLocaleDateString("nl-NL"),
      Leverancier: inv.supplier,
      Factuurnummer: inv.invoiceNumber,
      Werkpakket: `${inv.workPackage.code}: ${inv.workPackage.name}`,
      Omschrijving: inv.description,
      "Bedrag ex. btw": inv.amountExVat,
      "BTW": inv.vatAmount,
      "Bedrag incl. btw": inv.amountIncVat,
      Betaaldatum: inv.paymentDate ? new Date(inv.paymentDate).toLocaleDateString("nl-NL") : "",
      "Geüpload door": inv.uploadedBy.name,
      "Aangemaakt op": new Date(inv.createdAt).toLocaleString("nl-NL"),
    }));

    const csv = Papa.unparse(data, { delimiter: ";" });
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="facturen-export-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  }

  if (type === "clients") {
    const clients = await prisma.client.findMany({ orderBy: { startDate: "asc" } });

    const data = clients.map((c) => ({
      Cliëntcode: c.clientCode,
      Tool: c.toolUsed,
      Startdatum: new Date(c.startDate).toLocaleDateString("nl-NL"),
      Einddatum: c.endDate ? new Date(c.endDate).toLocaleDateString("nl-NL") : "Actief",
      Notities: c.notes || "",
      "Aangemaakt op": new Date(c.createdAt).toLocaleString("nl-NL"),
    }));

    const csv = Papa.unparse(data, { delimiter: ";" });
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="clienten-export-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  }

  if (type === "trainings") {
    const trainings = await prisma.training.findMany({
      orderBy: { date: "asc" },
      include: { attendees: true },
    });

    const data = trainings.flatMap((t) =>
      t.attendees.map((a) => ({
        Training: t.name,
        Datum: new Date(t.date).toLocaleDateString("nl-NL"),
        Uren: t.hours,
        Onderwerp: t.topic,
        Deelnemer: a.name,
        Aanwezig: a.present ? "Ja" : "Nee",
        "Aangemaakt op": new Date(t.createdAt).toLocaleString("nl-NL"),
      }))
    );

    const csv = Papa.unparse(data, { delimiter: ";" });
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="trainingen-export-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  }

  return NextResponse.json({ error: "Onbekend exporttype" }, { status: 400 });
}
