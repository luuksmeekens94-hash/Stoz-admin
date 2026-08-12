import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import HourCorrectionForm from "@/components/HourCorrectionForm";
import PlannedHourCorrectionForm from "@/components/PlannedHourCorrectionForm";
import { HISTORICAL_RECONSTRUCTION_CREATE_ACTION } from "@/lib/historical-reconstruction-db";
import { loadPlannedHourActors } from "@/lib/planned-hour-prefill";
import { amsterdamDateKey } from "@/lib/reporting-control";
import { buildReviewedForecastHourReview } from "@/lib/planned-hour-integrity";

export default async function HourCorrectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/auth/login");
  if (session.user.role !== "ADMIN") redirect("/uren");

  const { id } = await params;
  const [entry, workPackages, therapists, auditEvents, plannedHourActors] = await Promise.all([
    prisma.hourEntry.findUnique({
      where: { id },
      include: {
        user: true,
        therapist: true,
        workPackage: true,
        activity: true,
        sourceForecastEntry: {
          select: { id: true, plannedDate: true, executorName: true, plannedHours: true },
        },
      },
    }),
    prisma.workPackage.findMany({
      include: { activities: { orderBy: { code: "asc" } } },
      orderBy: { code: "asc" },
    }),
    prisma.therapist.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.auditEvent.findMany({
      where: { entityType: "HourEntry", entityId: id },
      orderBy: { createdAt: "desc" },
    }),
    loadPlannedHourActors(),
  ]);

  if (!entry) notFound();
  if (entry.sourceForecastEntryId) {
    if (entry.status !== "DRAFT" && entry.status !== "APPROVED") redirect("/uren");
  } else if (entry.status !== "APPROVED") {
    redirect("/uren");
  }
  const isHistoricalReconstruction = auditEvents.some(
    (event) => event.action === HISTORICAL_RECONSTRUCTION_CREATE_ACTION,
  );

  if (isHistoricalReconstruction) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Link className="text-sm text-primary-700 hover:underline" href="/uren?status=APPROVED">
          ← Terug naar goedgekeurde uren
        </Link>
        <section className="card border-amber-200 bg-amber-50">
          <h1 className="text-2xl font-bold text-amber-950">Historische reconstructie vergrendeld</h1>
          <p className="mt-3 text-sm text-amber-900">
            Deze registratie blijft gekoppeld aan de oorspronkelijke bron, doelstand en creatie-audit.
            Daarom is het gewone correctieformulier niet beschikbaar.
          </p>
          <p className="mt-2 text-sm text-amber-900">
            Zet de reconstructie als beheerder via de urenlijst terug naar concept. Daarna kun je het
            concept auditbaar verwijderen en met een nieuwe request-id opnieuw reconstrueren, zonder
            het bestaande auditspoor te overschrijven.
          </p>
        </section>
      </div>
    );
  }

  if (entry.sourceForecastEntryId) {
    const actorIds = Array.from(new Set(auditEvents.flatMap((audit) => audit.actorUserId || [])));
    const auditActors = actorIds.length
      ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
      : [];
    const review = buildReviewedForecastHourReview({
      sourceForecastEntryId: entry.sourceForecastEntryId,
      sourceForecast: entry.sourceForecastEntry,
      audits: auditEvents,
      actorNameById: new Map(auditActors.map((actor) => [actor.id, actor.name])),
    });
    if (review.integrity !== "VALID" || !review.sourceReference) {
      return (
        <div className="mx-auto max-w-2xl space-y-6">
          <Link className="text-sm text-primary-700 hover:underline" href="/uren">← Terug naar uren</Link>
          <section className="card border-red-200 bg-red-50" role="alert">
            <h1 className="text-2xl font-bold text-red-950">Planninguur geblokkeerd</h1>
            <p className="mt-3 text-sm text-red-900">
              De oorspronkelijke bron- of auditintegriteit is ongeldig. Corrigeren is fail-closed geblokkeerd.
            </p>
          </section>
        </div>
      );
    }
    const actorKey = entry.therapistId
      ? `therapist:${entry.userId}:${entry.therapistId}`
      : `user:${entry.userId}`;
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <Link className="text-sm text-primary-700 hover:underline" href="/uren">← Terug naar uren</Link>
          <h1 className="mt-2 text-2xl font-bold">Planninguur corrigeren</h1>
          <p className="text-gray-600">
            Corrigeer alleen wat werkelijk is uitgevoerd; de goedgekeurde bronplanning blijft ongewijzigd.
          </p>
        </div>
        <PlannedHourCorrectionForm
          entry={{
            id: entry.id,
            date: entry.date.toISOString().slice(0, 10),
            hours: entry.hours,
            description: entry.description,
            actorKey,
            workPackageCode: entry.workPackage.code,
            activityCode: entry.activity.code,
            activityName: entry.activity.name,
          }}
          actors={plannedHourActors}
          currentSourceReference={review.sourceReference}
          today={amsterdamDateKey(new Date())}
        />
        <section className="card">
          <h2 className="text-lg font-semibold">Auditgeschiedenis</h2>
          <div className="mt-3 space-y-3">
            {review.auditHistory.map((event, index) => (
              <div key={`${event.createdAt}-${event.action}-${index}`} className="rounded-lg border border-gray-200 p-3 text-sm">
                <div className="font-medium">{new Date(event.createdAt).toLocaleString("nl-NL")} · {event.action}</div>
                <p className="mt-1 text-gray-700">{event.reason}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link className="text-sm text-primary-700 hover:underline" href="/uren?status=APPROVED">
          ← Terug naar goedgekeurde uren
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Goedgekeurde registratie corrigeren</h1>
        <p className="text-gray-600">
          {entry.therapist?.name ?? entry.user.name} · {entry.workPackage.code} · {entry.hours} uur
        </p>
      </div>

      <HourCorrectionForm
        entry={{
          id: entry.id,
          date: entry.date.toISOString(),
          hours: entry.hours,
          description: entry.description,
          workPackageId: entry.workPackageId,
          activityId: entry.activityId,
          therapistId: entry.therapistId,
        }}
        workPackages={workPackages.map((workPackage) => ({
          id: workPackage.id,
          code: workPackage.code,
          name: workPackage.name,
          activities: workPackage.activities.map((activity) => ({
            id: activity.id,
            code: activity.code,
            name: activity.name,
          })),
        }))}
        therapists={therapists.map((therapist) => ({ id: therapist.id, name: therapist.name }))}
      />

      {auditEvents.length > 0 && (
        <section className="card">
          <h2 className="text-lg font-semibold">Correctiehistorie</h2>
          <div className="mt-3 space-y-3">
            {auditEvents.map((event) => (
              <div key={event.id} className="rounded-lg border border-gray-200 p-3 text-sm">
                <div className="font-medium">{event.createdAt.toLocaleString("nl-NL")} · {event.action}</div>
                <p className="mt-1 text-gray-700">{event.reason}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
