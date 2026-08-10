import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { validateInvoiceClassification } from "@/lib/invoice-classification";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Ongeldige invoer." }, { status: 400 });
  }

  const { id } = await params;
  const raw = body as Record<string, unknown>;

  try {
    const updated = await prisma.$transaction(
      async (tx) => {
        const invoice = await tx.invoice.findUnique({
          where: { id },
          include: { workPackage: { select: { code: true } } },
        });
        if (!invoice) return null;

        const validated = validateInvoiceClassification({
          budgetLineId: raw.budgetLineId,
          vatTreatment: raw.vatTreatment,
          reason: raw.reason,
          workPackageCode: invoice.workPackage.code,
        });
        const beforeData = {
          confirmedBudgetLineId: invoice.confirmedBudgetLineId,
          vatTreatment: invoice.vatTreatment,
          classificationReason: invoice.classificationReason,
          classifiedAt: invoice.classifiedAt,
          classifiedById: invoice.classifiedById,
        };
        const classifiedAt = new Date();
        const after = await tx.invoice.update({
          where: { id },
          data: {
            confirmedBudgetLineId: validated.budgetLineId,
            vatTreatment: validated.vatTreatment,
            classificationReason: validated.reason,
            classifiedAt,
            classifiedById: session.user.id,
          },
        });
        await tx.auditEvent.create({
          data: {
            entityType: "Invoice",
            entityId: id,
            action: "CLASSIFICATION_CONFIRMED",
            reason: validated.reason,
            beforeData,
            afterData: {
              confirmedBudgetLineId: after.confirmedBudgetLineId,
              vatTreatment: after.vatTreatment,
              classificationReason: after.classificationReason,
              classifiedAt: after.classifiedAt,
              classifiedById: after.classifiedById,
            },
            actorUserId: session.user.id,
          },
        });
        return after;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (!updated) return NextResponse.json({ error: "Factuur niet gevonden." }, { status: 404 });
    return NextResponse.json({
      ok: true,
      classification: {
        budgetLineId: updated.confirmedBudgetLineId,
        vatTreatment: updated.vatTreatment,
        classifiedAt: updated.classifiedAt,
      },
    });
  } catch (error) {
    if (error instanceof Error && !error.message.startsWith("Invalid `prisma")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Invoice classification failed", error);
    return NextResponse.json(
      { error: "Classificatie kon niet veilig worden opgeslagen; probeer opnieuw." },
      { status: 409 },
    );
  }
}
