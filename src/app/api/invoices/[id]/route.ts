import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildUnclassifiedInvoiceDeleteWhere,
  isClassifiedInvoiceImmutable,
} from "@/lib/invoice-classification";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  const isAdmin = session.user.role === "ADMIN";
  const isOwner = invoice.uploadedById === session.user.id;

  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  if (isClassifiedInvoiceImmutable(invoice)) {
    return NextResponse.json(
      { error: "Een geclassificeerde factuur is onderdeel van het auditspoor en kan niet worden verwijderd" },
      { status: 409 },
    );
  }

  const deletion = await prisma.invoice.deleteMany({
    where: buildUnclassifiedInvoiceDeleteWhere(invoice),
  });
  if (deletion.count !== 1) {
    return NextResponse.json(
      { error: "De factuur is gelijktijdig gewijzigd of geclassificeerd en is niet verwijderd" },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}
