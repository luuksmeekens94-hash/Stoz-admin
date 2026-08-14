import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  assertHourEntryCasUpdated,
  buildHourEntryCasWhere,
  HourEntryConcurrencyError,
} from "@/lib/hour-entry-concurrency";
import {
  historicalReconstructionEntrySnapshot,
  isAllowedHistoricalReconstructionTransition,
  loadAndValidateHistoricalReconstruction,
  loadAndValidateHistoricalReconstructionWithHighestScopeTarget,
  validateInterimProposalTarget,
} from "@/lib/historical-reconstruction-db";
import { HistoricalReconstructionIntegrityError } from "@/lib/historical-reconstruction-integrity";

type HistoricalTransitionStatus = "DRAFT" | "SUBMITTED" | "APPROVED";

class HistoricalReconstructionNotFoundError extends Error {}

function errorResponse(error: unknown) {
  if (error instanceof HistoricalReconstructionNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  const isConflict =
    error instanceof HourEntryConcurrencyError ||
    error instanceof HistoricalReconstructionIntegrityError ||
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034");
  if (isConflict) {
    const message =
      error instanceof HistoricalReconstructionIntegrityError
        ? error.message
        : "De reconstructieregel is gelijktijdig gewijzigd. Vernieuw de pagina.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
  console.error("Historical reconstruction mutation error:", error);
  return NextResponse.json(
    { error: "Mutatie van de historische reconstructie is mislukt." },
    { status: 500 },
  );
}

async function requireAdminSession() {
  const session = await getSession();
  if (!session) {
    return { response: NextResponse.json({ error: "Niet ingelogd" }, { status: 401 }) };
  }
  if (session.user.role !== "ADMIN") {
    return {
      response: NextResponse.json(
        { error: "Alleen een beheerder mag historische reconstructies beheren." },
        { status: 403 },
      ),
    };
  }
  return { session };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await requireAdminSession();
  if ("response" in authorization) return authorization.response;

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige JSON-aanvraag." }, { status: 400 });
  }
  if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
    return NextResponse.json({ error: "De aanvraag moet een object zijn." }, { status: 400 });
  }
  const body = parsedBody as Record<string, unknown>;
  if (
    typeof body.status !== "string" ||
    Object.keys(body).some((key) => key !== "status")
  ) {
    return NextResponse.json(
      { error: "Wijzig bij een historische reconstructie alleen de status." },
      { status: 400 },
    );
  }

  const { id } = await params;
  const entry = await prisma.hourEntry.findUnique({ where: { id } });
  if (!entry) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });

  const targetStatus = body.status as HistoricalTransitionStatus;
  if (!isAllowedHistoricalReconstructionTransition(entry.status, targetStatus)) {
    return NextResponse.json({ error: "Ongeldige statuswijziging" }, { status: 403 });
  }

  try {
    const updated = await prisma.$transaction(
      async (tx) => {
        const current = await tx.hourEntry.findUnique({ where: { id } });
        if (!current || current.status !== entry.status) {
          throw new HourEntryConcurrencyError();
        }
        const reconstruction = targetStatus === "DRAFT"
          ? await loadAndValidateHistoricalReconstruction(tx, current, { enforceTarget: false })
          : await loadAndValidateHistoricalReconstructionWithHighestScopeTarget(tx, current);
        if (!reconstruction) {
          throw new HistoricalReconstructionIntegrityError(
            "De registratie is geen geldige historische reconstructie.",
          );
        }
        if (targetStatus !== "DRAFT") {
          await validateInterimProposalTarget(tx, current);
        }

        const approved = targetStatus === "APPROVED";
        const mutation = await tx.hourEntry.updateMany({
          where: buildHourEntryCasWhere(current),
          data: {
            status: targetStatus,
            approvedAt: approved ? new Date() : null,
            approvedBy: approved ? authorization.session.user.id : null,
          },
        });
        assertHourEntryCasUpdated(mutation.count);
        const result = await tx.hourEntry.findUniqueOrThrow({ where: { id } });
        await tx.auditEvent.create({
          data: {
            entityType: "HourEntry",
            entityId: current.id,
            action: `${targetStatus}_HISTORICAL_RECONSTRUCTION`,
            reason: `Auditbare statuswijziging van historische reconstructie: ${entry.status} → ${targetStatus}.`,
            beforeData:
              historicalReconstructionEntrySnapshot(current) as unknown as Prisma.InputJsonValue,
            afterData:
              historicalReconstructionEntrySnapshot(result) as unknown as Prisma.InputJsonValue,
            actorUserId: authorization.session.user.id,
          },
        });
        return result;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  void request;
  const authorization = await requireAdminSession();
  if ("response" in authorization) return authorization.response;
  const { id } = await params;

  try {
    await prisma.$transaction(
      async (tx) => {
        const current = await tx.hourEntry.findUnique({ where: { id } });
        if (!current) throw new HistoricalReconstructionNotFoundError("Niet gevonden");
        if (current.status !== "DRAFT") {
          throw new HistoricalReconstructionIntegrityError(
            "Alleen een reconstructieconcept kan worden verwijderd.",
          );
        }
        const reconstruction = await loadAndValidateHistoricalReconstruction(tx, current, {
          enforceTarget: false,
        });
        if (!reconstruction) {
          throw new HistoricalReconstructionIntegrityError(
            "De registratie is geen geldige historische reconstructie.",
          );
        }

        const deletion = await tx.hourEntry.deleteMany({
          where: buildHourEntryCasWhere(current),
        });
        assertHourEntryCasUpdated(deletion.count);
        await tx.auditEvent.create({
          data: {
            entityType: "HourEntry",
            entityId: current.id,
            action: "DELETED_HISTORICAL_RECONSTRUCTION",
            reason:
              "Historisch reconstructieconcept auditbaar verwijderd door een beheerder; maak bij een inhoudelijke fout een nieuwe reconstructieregel.",
            beforeData:
              historicalReconstructionEntrySnapshot(current) as unknown as Prisma.InputJsonValue,
            afterData: {
              deleted: true,
              creationAuditEventId: reconstruction.audit.id,
            },
            actorUserId: authorization.session.user.id,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
