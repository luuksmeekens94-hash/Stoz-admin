import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import HourForm from "@/components/HourForm";
import { amsterdamDateKey } from "@/lib/reporting-control";
import PlannedHourMaterializer from "@/components/PlannedHourMaterializer";
import { loadPlannedHourPrefill, PlannedHourPrefillError } from "@/lib/planned-hour-prefill";

export default async function NieuwUrenPage({
  searchParams,
}: {
  searchParams: Promise<{ wp?: string; activity?: string; description?: string; forecastEntryId?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/auth/login");
  const params = await searchParams;

  if (params.forecastEntryId) {
    if (session.user.role !== "ADMIN") redirect("/uren");
    try {
      const prefill = await loadPlannedHourPrefill(params.forecastEntryId);
      return (
        <div>
          <h1 className="mb-2 text-2xl font-bold">Gepland werk registreren</h1>
          <p className="mb-6 text-gray-600">Controleer de planning aan de hand van wat werkelijk is uitgevoerd.</p>
          <PlannedHourMaterializer {...prefill} today={amsterdamDateKey(new Date())} />
        </div>
      );
    } catch (error) {
      const message = error instanceof PlannedHourPrefillError ? error.message : "De geplande regel kon niet worden geladen.";
      return <div className="card border-red-200 bg-red-50 text-red-900" role="alert">{message}</div>;
    }
  }

  const [workPackages, allUsers, therapists] = await Promise.all([
    prisma.workPackage.findMany({
      include: { activities: true },
      orderBy: { code: "asc" },
    }),
    session.user.role === "ADMIN"
      ? prisma.user.findMany({
          where: { active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, role: true },
        })
      : Promise.resolve([]),
    prisma.therapist.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  const requestedWorkPackage = workPackages.find((row) => row.code === params.wp);
  const requestedActivity = requestedWorkPackage?.activities.find(
    (activity) => activity.code === params.activity,
  );
  const fromPlanning = Boolean(params.wp || params.activity || params.description);
  const validPlanningPrefill = Boolean(requestedWorkPackage && requestedActivity);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Uren registreren</h1>
      {fromPlanning && (
        <div
          className={`mb-6 rounded-xl border p-4 text-sm ${
            validPlanningPrefill
              ? "border-blue-200 bg-blue-50 text-blue-950"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          <p className="font-bold">
            {validPlanningPrefill ? "Vooraf ingevuld vanuit operationele forecast" : "Ongeldige planverwijzing"}
          </p>
          <p className="mt-1">
            {validPlanningPrefill
              ? "Dit formulier is nog leeg voor datum, uitvoerder en uren. Controleer wat werkelijk is uitgevoerd; opslaan maakt pas daarna een conceptregistratie."
              : "Werkpakket en activiteit zijn niet vooraf geselecteerd. Kies ze handmatig en registreer alleen werkelijk uitgevoerd werk."}
          </p>
        </div>
      )}
      <HourForm
        workPackages={JSON.parse(JSON.stringify(workPackages))}
        currentUser={{ id: session.user.id, name: session.user.name, role: session.user.role }}
        allUsers={JSON.parse(JSON.stringify(allUsers))}
        therapists={JSON.parse(JSON.stringify(therapists))}
        ordinaryRegistrationDate={amsterdamDateKey(new Date())}
        initialValues={{
          activityId: requestedActivity?.id,
          description: validPlanningPrefill ? String(params.description || "").slice(0, 240) : undefined,
        }}
      />
    </div>
  );
}
