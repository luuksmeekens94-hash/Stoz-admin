import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { amsterdamDateKey, resolveReportAsOf } from "@/lib/reporting-control";
import { PROJECT_STEERING_CONFIG } from "@/lib/project-plan";
import {
  INTERIM_CALCULATION_VERSION,
  resolveInterimBudgetCategory,
} from "@/lib/interim-hour-steering-db";
import InterimProposalMaterializer, {
  InterimMaterializationProposal,
} from "@/components/InterimProposalMaterializer";
import HistoricalReconstructionPlanner, {
  ReconstructionActivityOption,
  ReconstructionActorOption,
  ReconstructionRegisteredGroup,
} from "@/components/HistoricalReconstructionPlanner";

export const dynamic = "force-dynamic";

const roleLabels: Record<string, string> = {
  ADMIN: "Beheerder / projectuitvoering",
  INTERNAL: "Interne medewerker",
  EXTERNAL: "Externe medewerker",
};

const proposalCategoryByKey: Record<string, string> = {
  PRACTICE_PROJECT_MANAGEMENT: "Praktijkmanager",
  PRACTICE_IMPLEMENTATION: "Praktijkmanager",
  PHYSIOTHERAPIST_IMPLEMENTATION: "Fysiotherapeuten",
  FRONT_BACKOFFICE_IMPLEMENTATION: "Front/backoffice",
  EXTERNAL_PROJECT_MANAGEMENT: "Extern adviseur",
  WEBSITE_BUILDER: "Websitebouwer",
  INTERNAL_TRAINER: "Praktijkmanager",
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

  const [users, therapists, workPackages, entries, budgetAllocations, storedProposals] =
    await Promise.all([
      prisma.user.findMany({
        where: { active: true },
        select: { id: true, name: true, role: true, email: true },
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
      prisma.interimHourProposal.findMany({
        where: {
          proposalSet: {
            asOf: new Date(`${asOf}T00:00:00.000Z`),
            calculationVersion: INTERIM_CALCULATION_VERSION,
          },
        },
        select: {
          id: true,
          budgetLineKey: true,
          title: true,
          targetQuarters: true,
          workPackage: { select: { id: true, code: true } },
          activity: { select: { code: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

  const categoryByUserId = new Map(
    budgetAllocations
      .filter((allocation): allocation is { userId: string; category: string } => Boolean(allocation.userId))
      .map((allocation) => [allocation.userId, allocation.category]),
  );
  const categoryForUser = (user: (typeof users)[number]) =>
    resolveInterimBudgetCategory(user, categoryByUserId);
  const userById = new Map(users.map((user) => [user.id, user]));
  const workPackageCodeById = new Map(workPackages.map((row) => [row.id, row.code]));

  const teamUsers = users.filter((user) => user.role === "TEAM");
  const regularActors: ReconstructionActorOption[] = users
    .filter((user) => user.role !== "TEAM")
    .map((user) => ({
      key: `user:${user.id}`,
      userId: user.id,
      therapistId: null,
      name: user.name,
      roleLabel: categoryForUser(user) || roleLabels[user.role] || user.role,
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
  const actors = [...regularActors, ...therapistActors].sort((a, b) =>
    a.name.localeCompare(b.name, "nl"),
  );
  const categoryByActorKey = new Map<string, string | null>([
    ...regularActors.map((actor) => [
      actor.key,
      categoryForUser(userById.get(actor.userId)!),
    ] as const),
    ...therapistActors.map((actor) => [
      actor.key,
      categoryForUser(userById.get(actor.userId)!),
    ] as const),
  ]);

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
  const registeredByCategoryAndWorkPackage = new Map<string, number>();
  for (const entry of entries) {
    const actorKey = entry.therapistId
      ? `therapist:${entry.userId}:${entry.therapistId}`
      : `user:${entry.userId}`;
    const groupKey = `${actorKey}|${entry.activityId}`;
    const existing = groupMap.get(groupKey) || {
      key: groupKey,
      actorKey,
      activityId: entry.activityId,
      registeredHours: 0,
      approvedHours: 0,
      openHours: 0,
    };
    existing.registeredHours += entry.hours;
    if (entry.status === "APPROVED") existing.approvedHours += entry.hours;
    else existing.openHours += entry.hours;
    groupMap.set(groupKey, existing);

    const user = userById.get(entry.userId);
    const category = user ? categoryForUser(user) : null;
    const workPackageCode = workPackageCodeById.get(entry.workPackageId);
    if (category && workPackageCode) {
      const scopeKey = `${category}|${workPackageCode}`;
      registeredByCategoryAndWorkPackage.set(
        scopeKey,
        (registeredByCategoryAndWorkPackage.get(scopeKey) || 0) + entry.hours,
      );
    }
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

  const proposals: InterimMaterializationProposal[] = storedProposals.flatMap((proposal) => {
    const category = proposalCategoryByKey[proposal.budgetLineKey];
    if (!category) return [];
    const targetHours = proposal.targetQuarters / 4;
    const currentHours = registeredByCategoryAndWorkPackage.get(
      `${category}|${proposal.workPackage.code}`,
    ) || 0;
    const remainingHours = Math.round(Math.max(0, targetHours - currentHours) * 100) / 100;
    if (remainingHours === 0) return [];
    return [{
      id: proposal.id,
      title: proposal.title,
      workPackageCode: proposal.workPackage.code,
      activityCode: proposal.activity.code,
      activityName: proposal.activity.name,
      targetHours,
      currentHours,
      remainingHours,
      actors: actors.filter((actor) => categoryByActorKey.get(actor.key) === category),
    }];
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Datums en uitvoerders invullen</h1>
          <p className="text-gray-600">
            Werk de klaargezette aanvullingen één voor één uit tot controleerbare conceptregistraties.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard" className="btn-secondary">Uren op koers</Link>
          <Link href="/uren" className="btn-secondary">Urenregistratie</Link>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="card">
          <div className="text-sm text-gray-500">Geregistreerd t/m peildatum</div>
          <div className="mt-1 text-2xl font-bold">{totalRegistered.toLocaleString("nl-NL")} uur</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500">Nog concept of ingediend</div>
          <div className="mt-1 text-2xl font-bold">{totalOpen.toLocaleString("nl-NL")} uur</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500">Niet aan actieve uitvoerder gekoppeld</div>
          <div className={`mt-1 text-2xl font-bold ${unassignedHours ? "text-red-700" : "text-green-700"}`}>
            {unassignedHours.toLocaleString("nl-NL")} uur
          </div>
        </div>
      </div>

      <InterimProposalMaterializer asOf={asOf} proposals={proposals} />

      <details className="card mt-6">
        <summary className="cursor-pointer font-semibold">Andere historische correctie handmatig invoeren</summary>
        <div className="mt-5">
          <HistoricalReconstructionPlanner
            asOf={asOf}
            actors={actors}
            activities={activities}
            groups={groups}
            suggestions={[]}
          />
        </div>
      </details>
    </div>
  );
}
