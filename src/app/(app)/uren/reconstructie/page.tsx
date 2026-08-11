import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { amsterdamDateKey, resolveReportAsOf } from "@/lib/reporting-control";
import { PROJECT_STEERING_CONFIG } from "@/lib/project-plan";
import HistoricalReconstructionPlanner, {
  ReconstructionActivityOption,
  ReconstructionActorOption,
  ReconstructionRegisteredGroup,
  ReconstructionSuggestion,
} from "@/components/HistoricalReconstructionPlanner";

export const dynamic = "force-dynamic";

const roleLabels: Record<string, string> = {
  ADMIN: "Beheerder / projectuitvoering",
  INTERNAL: "Interne medewerker",
  EXTERNAL: "Externe medewerker",
};

export default async function UrenReconstructiePage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");
  if (session.user.role !== "ADMIN") redirect("/uren");

  const asOf = resolveReportAsOf({
    today: amsterdamDateKey(),
    periodEnd: PROJECT_STEERING_CONFIG.reportPeriodEnd,
  });
  const asOfEnd = new Date(`${asOf}T23:59:59.999Z`);

  const [users, therapists, workPackages, entries, budgetAllocations] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.therapist.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.workPackage.findMany({
      orderBy: { code: "asc" },
      include: { activities: { orderBy: { code: "asc" } } },
    }),
    prisma.hourEntry.findMany({
      where: { date: { lte: asOfEnd } },
      select: {
        userId: true,
        therapistId: true,
        workPackageId: true,
        activityId: true,
        status: true,
        hours: true,
      },
    }),
    prisma.budgetAllocation.findMany({
      where: { userId: { not: null } },
      select: { userId: true, category: true },
    }),
  ]);

  const categoryByUserId = new Map(
    budgetAllocations
      .filter((allocation): allocation is { userId: string; category: string } => Boolean(allocation.userId))
      .map((allocation) => [allocation.userId, allocation.category]),
  );
  const teamUsers = users.filter((user) => user.role === "TEAM");
  const regularActors: ReconstructionActorOption[] = users
    .filter((user) => user.role !== "TEAM")
    .map((user) => ({
      key: `user:${user.id}`,
      userId: user.id,
      therapistId: null,
      name: user.name,
      roleLabel: categoryByUserId.get(user.id) || roleLabels[user.role] || user.role,
    }));
  const therapistActors: ReconstructionActorOption[] = teamUsers.flatMap((teamUser) =>
    therapists.map((therapist) => ({
      key: `therapist:${teamUser.id}:${therapist.id}`,
      userId: teamUser.id,
      therapistId: therapist.id,
      name: therapist.name,
      roleLabel: "Fysiotherapeut (Fy-fit)",
    })),
  );
  const actors = [...regularActors, ...therapistActors].sort((a, b) => a.name.localeCompare(b.name, "nl"));

  const activities: ReconstructionActivityOption[] = workPackages.flatMap((workPackage) =>
    workPackage.activities.map((activity) => ({
      id: activity.id,
      code: activity.code,
      name: activity.name,
      workPackageId: workPackage.id,
      workPackageCode: workPackage.code,
      workPackageName: workPackage.name,
    })),
  );

  const groupMap = new Map<string, ReconstructionRegisteredGroup>();
  for (const entry of entries) {
    const actorKey = entry.therapistId
      ? `therapist:${entry.userId}:${entry.therapistId}`
      : `user:${entry.userId}`;
    const key = `${actorKey}|${entry.activityId}`;
    const existing = groupMap.get(key) || {
      key,
      actorKey,
      activityId: entry.activityId,
      registeredHours: 0,
      approvedHours: 0,
      openHours: 0,
    };
    existing.registeredHours += entry.hours;
    if (entry.status === "APPROVED") existing.approvedHours += entry.hours;
    else existing.openHours += entry.hours;
    groupMap.set(key, existing);
  }

  const actorKeys = new Set(actors.map((actor) => actor.key));
  const activityIds = new Set(activities.map((activity) => activity.id));
  const groups = Array.from(groupMap.values()).filter(
    (group) => actorKeys.has(group.actorKey) && activityIds.has(group.activityId),
  );
  const unassignedHours = Array.from(groupMap.values())
    .filter((group) => !actorKeys.has(group.actorKey) || !activityIds.has(group.activityId))
    .reduce((sum, group) => sum + group.registeredHours, 0);
  const totalRegistered = Array.from(groupMap.values()).reduce(
    (sum, group) => sum + group.registeredHours,
    0,
  );
  const totalOpen = Array.from(groupMap.values()).reduce(
    (sum, group) => sum + group.openHours,
    0,
  );
  const trainingActivity = activities.find(
    (activity) => activity.workPackageCode === "WP3" && activity.code === "A3.1",
  );
  const trainingActors = trainingActivity
    ? actors.filter(
        (actor) =>
          actor.therapistId === null &&
          budgetAllocations.some(
            (allocation) =>
              allocation.category === "Praktijkmanager" && allocation.userId === actor.userId,
          ) &&
          groups.some(
            (group) =>
              group.actorKey === actor.key &&
              group.activityId === trainingActivity.id &&
              group.registeredHours > 0,
          ),
      )
    : [];
  const trainingActor = trainingActors.length === 1 ? trainingActors[0] : null;
  const suggestions: ReconstructionSuggestion[] =
    trainingActor && trainingActivity
      ? [
          {
            id: "interim-training-catch-up",
            title: "Training aanvullen tot 20 uur",
            actorKey: trainingActor.key,
            activityId: trainingActivity.id,
            targetHours: 20,
            description:
              "Voorbereiding, afstemming en uitvoering van de praktijktraining over communicatie en hybride ondersteuning.",
            sourceReference:
              "Besluit projecteigenaar 11 augustus 2026: deze trainingswerkzaamheden zijn daadwerkelijk uitgevoerd.",
          },
        ]
      : [];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Uren tussenrapportage aanvullen</h1>
          <p className="text-gray-600">
            Zet bevestigde ontbrekende uren klaar, vul de uitvoeringsdatum in en maak de conceptregel aan.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/uren" className="btn-secondary">Urenregistratie</Link>
          <Link href="/urensturing" className="btn-secondary">Rapportage</Link>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <div className="card">
          <div className="text-sm text-gray-500">Geregistreerd t/m peildatum</div>
          <div className="text-2xl font-bold mt-1">{totalRegistered.toLocaleString("nl-NL")} uur</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500">Nog concept of ingediend</div>
          <div className="text-2xl font-bold mt-1">{totalOpen.toLocaleString("nl-NL")} uur</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500">Niet aan actieve uitvoerder gekoppeld</div>
          <div className={`text-2xl font-bold mt-1 ${unassignedHours ? "text-red-700" : "text-green-700"}`}>
            {unassignedHours.toLocaleString("nl-NL")} uur
          </div>
        </div>
      </div>

      <HistoricalReconstructionPlanner
        asOf={asOf}
        actors={actors}
        activities={activities}
        groups={groups}
        suggestions={suggestions}
      />
    </div>
  );
}
