import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import HourCorrectionForm from "@/components/HourCorrectionForm";

export default async function HourCorrectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/auth/login");
  if (session.user.role !== "ADMIN") redirect("/uren");

  const { id } = await params;
  const [entry, workPackages, therapists, auditEvents] = await Promise.all([
    prisma.hourEntry.findUnique({
      where: { id },
      include: { user: true, therapist: true, workPackage: true, activity: true },
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
  ]);

  if (!entry) notFound();
  if (entry.status !== "APPROVED") redirect("/uren");

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
                <div className="font-medium">
                  {event.createdAt.toLocaleString("nl-NL")} · {event.action}
                </div>
                <p className="mt-1 text-gray-700">{event.reason}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
