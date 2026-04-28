import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const isAdmin = session.user.role === "ADMIN";
  const where = isAdmin ? {} : { uploadedById: session.user.id };

  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: { date: "desc" },
    include: {
      workPackage: true,
      uploadedBy: { select: { name: true } },
    },
  });

  return NextResponse.json(invoices);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  if (session.user.role !== "ADMIN" && session.user.role !== "EXTERNAL") {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  try {
    const formData = await request.formData();

    const date = formData.get("date") as string;
    const supplier = formData.get("supplier") as string;
    const invoiceNumber = formData.get("invoiceNumber") as string;
    const description = formData.get("description") as string;
    const amountExVat = parseFloat(formData.get("amountExVat") as string) || 0;
    const vatAmount = parseFloat(formData.get("vatAmount") as string) || 0;
    const amountIncVat = parseFloat(formData.get("amountIncVat") as string) || 0;
    const paymentDate = formData.get("paymentDate") as string;
    const workPackageId = formData.get("workPackageId") as string;
    const file = formData.get("file") as File | null;

    if (!date || !supplier || !invoiceNumber || !description || !workPackageId) {
      return NextResponse.json({ error: "Verplichte velden ontbreken" }, { status: 400 });
    }

    let fileData: string | undefined;
    let fileName: string | undefined;
    let fileMime: string | undefined;

    if (file && file.size > 0) {
      const bytes = await file.arrayBuffer();
      fileData = Buffer.from(bytes).toString("base64");
      fileName = file.name;
      fileMime = file.type;
    }

    const invoice = await prisma.invoice.create({
      data: {
        date: new Date(date),
        supplier,
        invoiceNumber,
        description,
        amountExVat,
        vatAmount,
        amountIncVat,
        paymentDate: paymentDate ? new Date(paymentDate) : null,
        workPackageId,
        uploadedById: session.user.id,
        fileData,
        fileName,
        fileMime,
      },
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown";
    console.error("Invoice upload error:", msg);
    return NextResponse.json({ error: `Fout bij opslaan: ${msg}` }, { status: 500 });
  }
}
