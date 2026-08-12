import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import HoursList from "@/components/HoursList";
import ReviewedPlanningHours from "@/components/ReviewedPlanningHours";
import { loadReviewedPlanningHours } from "@/lib/reviewed-planning-hours";
import { HISTORICAL_RECONSTRUCTION_CREATE_ACTION } from "@/lib/historical-reconstruction-db";
import { parseHistoricalReconstructionProvenance } from "@/lib/historical-reconstruction-integrity";
import { buildReviewedForecastHourReview } from "@/lib/planned-hour-integrity";

export default async function UrenPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; userId?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const params = await searchParams;
  const isAdmin = session.user.role === "ADMIN";

  const where: Record<string, unknown> = {};
  if (!isAdmin) {
    where.userId = session.user.id;
  } else if (params.userId) {
    where.userId = params.userId;
  }
  if (params.status) {
    where.status = params.status;
  }

  const [entries, reviewedPlanningHours] = await Promise.all([
    prisma.hourEntry.findMany({
      where,
      orderBy: { date: "desc" },
      include: {
        user: { select: { id: true, name: true } },
        workPackage: true,
        activity: true,
        therapist: true,
        sourceForecastEntry: {
          select: { id: true, plannedDate: true, executorName: true, plannedHours: true },
        },
      },
    }),
    isAdmin ? loadReviewedPlanningHours() : Promise.resolve([]),
  ]);
  const reconstructionAudits = entries.length
    ? await prisma.auditEvent.findMany({
        where: {
          entityType: "HourEntry",
          entityId: { in: entries.map((entry) => entry.id) },
          action: HISTORICAL_RECONSTRUCTION_CREATE_ACTION,
        },
        select: {
          id: true,
          entityId: true,
          action: true,
          reason: true,
          beforeData: true,
          afterData: true,
          actorUserId: true,
          createdAt: true,
        },
      })
    : [];
  const reconstructionEntryIds = new Set(
    reconstructionAudits.map((audit) => audit.entityId),
  );
  const allReconstructionAudits =
    isAdmin && reconstructionEntryIds.size
      ? await prisma.auditEvent.findMany({
          where: {
            entityType: "HourEntry",
            entityId: { in: Array.from(reconstructionEntryIds) },
          },
          orderBy: { createdAt: "asc" },
          select: {
            entityId: true,
            action: true,
            reason: true,
            actorUserId: true,
            createdAt: true,
          },
        })
      : [];
  const planningEntryIds = entries
    .filter((entry) => Boolean(entry.sourceForecastEntryId))
    .map((entry) => entry.id);
  const allPlanningAudits =
    isAdmin && planningEntryIds.length
      ? await prisma.auditEvent.findMany({
          where: { entityType: "HourEntry", entityId: { in: planningEntryIds } },
          orderBy: { createdAt: "asc" },
          select: {
            entityId: true,
            action: true,
            reason: true,
            beforeData: true,
            afterData: true,
            actorUserId: true,
            createdAt: true,
          },
        })
      : [];
  const actorIds = Array.from(
    new Set(
      [...allReconstructionAudits, ...allPlanningAudits].flatMap(
        (audit) => audit.actorUserId || [],
      ),
    ),
  );
  const auditActors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true },
      })
    : [];
  const actorNameById = new Map(auditActors.map((actor) => [actor.id, actor.name]));
  const createAuditByEntryId = new Map(
    reconstructionAudits.map((audit) => [audit.entityId, audit]),
  );
  const planningReviewByEntryId = new Map(
    entries
      .filter((entry) => Boolean(entry.sourceForecastEntryId))
      .map((entry) => [
        entry.id,
        buildReviewedForecastHourReview({
          sourceForecastEntryId: entry.sourceForecastEntryId!,
          sourceForecast: entry.sourceForecastEntry,
          audits: allPlanningAudits.filter((audit) => audit.entityId === entry.id),
          actorNameById,
        }),
      ]),
  );
  const serializedEntries = JSON.parse(JSON.stringify(entries)).map(
    (entry: { id: string }) => {
      const isHistoricalReconstruction = reconstructionEntryIds.has(entry.id);
      let reconstructionReview = null;
      if (isAdmin && isHistoricalReconstruction) {
        const creationAudit = createAuditByEntryId.get(entry.id);
        try {
          if (!creationAudit) throw new Error("Creatie-audit ontbreekt");
          const provenance = parseHistoricalReconstructionProvenance(creationAudit);
          reconstructionReview = {
            integrity: "VALID",
            asOf: provenance.asOf,
            confirmedTargetHours: provenance.confirmedTargetHours,
            sourceType: provenance.sourceType,
            sourceReference: provenance.sourceReference,
            performedConfirmation: provenance.performedConfirmation,
            auditHistory: allReconstructionAudits
              .filter((audit) => audit.entityId === entry.id)
              .map((audit) => ({
                action: audit.action,
                reason: audit.reason,
                actor: audit.actorUserId
                  ? actorNameById.get(audit.actorUserId) || audit.actorUserId
                  : "Systeem",
                createdAt: audit.createdAt.toISOString(),
              })),
          };
        } catch {
          reconstructionReview = {
            integrity: "INVALID",
            asOf: null,
            confirmedTargetHours: null,
            sourceType: null,
            sourceReference: null,
            performedConfirmation: false,
            auditHistory: allReconstructionAudits
              .filter((audit) => audit.entityId === entry.id)
              .map((audit) => ({
                action: audit.action,
                reason: audit.reason,
                actor: audit.actorUserId
                  ? actorNameById.get(audit.actorUserId) || audit.actorUserId
                  : "Systeem",
                createdAt: audit.createdAt.toISOString(),
              })),
          };
        }
      }
      return {
        ...entry,
        isHistoricalReconstruction,
        reconstructionReview,
        planningReview: isAdmin ? planningReviewByEntryId.get(entry.id) || null : null,
      };
    },
  );

  const users = isAdmin
    ? await prisma.user.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Urenregistratie</h1>
          <p className="text-gray-600">
            {isAdmin ? "Alle uren" : "Jouw uren"}{" "}
            {params.status === "SUBMITTED" && "— te beoordelen"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <Link href="/uren/reconstructie" className="btn-secondary">
              Verschil reconstrueren
            </Link>
          )}
          <Link href="/uren/nieuw" className="btn-primary">
            + Uren registreren
          </Link>
        </div>
      </div>

      {/* Filters */}
      {isAdmin && (
        <div className="card mb-6">
          <div className="flex flex-wrap gap-3">
            <Link
              href="/uren"
              className={`px-3 py-1.5 rounded-lg text-sm ${
                !params.status ? "bg-primary-100 text-primary-700" : "bg-gray-100 text-gray-600"
              }`}
            >
              Alle
            </Link>
            <Link
              href="/uren?status=DRAFT"
              className={`px-3 py-1.5 rounded-lg text-sm ${
                params.status === "DRAFT" ? "bg-gray-200 text-gray-800" : "bg-gray-100 text-gray-600"
              }`}
            >
              Concept
            </Link>
            <Link
              href="/uren?status=SUBMITTED"
              className={`px-3 py-1.5 rounded-lg text-sm ${
                params.status === "SUBMITTED"
                  ? "bg-yellow-100 text-yellow-800"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              Ingediend
            </Link>
            <Link
              href="/uren?status=APPROVED"
              className={`px-3 py-1.5 rounded-lg text-sm ${
                params.status === "APPROVED"
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              Goedgekeurd
            </Link>
            {users.length > 0 && (
              <span className="border-l border-gray-300 pl-3 flex items-center gap-2 text-sm text-gray-500">
                Per persoon:
                {users.map((u) => (
                  <Link
                    key={u.id}
                    href={`/uren?userId=${u.id}${params.status ? `&status=${params.status}` : ""}`}
                    className={`px-2 py-1 rounded text-xs ${
                      params.userId === u.id
                        ? "bg-primary-100 text-primary-700"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {u.name.split(" ")[0]}
                  </Link>
                ))}
              </span>
            )}
          </div>
        </div>
      )}

      {isAdmin && !params.status && <ReviewedPlanningHours rows={reviewedPlanningHours} />}

      <HoursList
        entries={serializedEntries}
        isAdmin={isAdmin}
        currentUserId={session.user.id}
      />
    </div>
  );
}
