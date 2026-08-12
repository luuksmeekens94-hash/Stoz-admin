import { prisma } from "@/lib/prisma";
import type { PlannedHourActor, PlannedHourSource } from "@/components/PlannedHourMaterializer";
import { resolveInterimBudgetCategory } from "@/lib/interim-hour-steering-db";

export class PlannedHourPrefillError extends Error {}

export async function loadPlannedHourActors(): Promise<PlannedHourActor[]> {
  const [users, therapists, budgetAllocations] = await Promise.all([
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
    prisma.budgetAllocation.findMany({
      where: { userId: { not: null } },
      select: { userId: true, category: true },
    }),
  ]);
  const categoryByUserId = new Map(
    budgetAllocations
      .filter((row): row is { userId: string; category: string } => Boolean(row.userId))
      .map((row) => [row.userId, row.category]),
  );
  const teamUsers = users.filter((user) => user.role === "TEAM");
  const regularActors: PlannedHourActor[] = users
    .filter((user) => user.role !== "TEAM")
    .map((user) => ({
      key: `user:${user.id}`,
      userId: user.id,
      therapistId: null,
      name: user.name,
      roleLabel: resolveInterimBudgetCategory(user, categoryByUserId) || user.role,
    }));
  const therapistActors: PlannedHourActor[] = teamUsers.flatMap((teamUser) =>
    therapists.map((therapist) => ({
      key: `therapist:${teamUser.id}:${therapist.id}`,
      userId: teamUser.id,
      therapistId: therapist.id,
      name: therapist.name,
      roleLabel: "Fysiotherapeut (Fy-fit)",
    })),
  );
  return [...regularActors, ...therapistActors].sort((a, b) => a.name.localeCompare(b.name, "nl"));
}

export async function loadPlannedHourPrefill(forecastEntryId: string): Promise<{
  planning: PlannedHourSource;
  actors: PlannedHourActor[];
}> {
  const [forecast, actors] = await Promise.all([
    prisma.forecastEntry.findUnique({
      where: { id: forecastEntryId },
      select: {
        id: true,
        plannedDate: true,
        executorName: true,
        plannedHours: true,
        note: true,
        materializedHourEntry: { select: { id: true } },
        allocation: {
          select: {
            reviewState: true,
            roleCategory: true,
            workPackage: { select: { code: true } },
            activity: { select: { code: true, name: true } },
            planningVersion: { select: { status: true } },
          },
        },
      },
    }),
    loadPlannedHourActors(),
  ]);
  if (!forecast) throw new PlannedHourPrefillError("Geplande regel niet gevonden.");
  if (forecast.allocation.reviewState !== "REVIEWED" || forecast.allocation.planningVersion.status !== "CONCEPT") {
    throw new PlannedHourPrefillError("Deze geplande regel is niet goedgekeurd in de actieve planning.");
  }
  if (forecast.materializedHourEntry) {
    throw new PlannedHourPrefillError("Deze geplande regel is al als concept geregistreerd.");
  }

  const exactNameMatches = actors.filter(
    (actor) => actor.name.trim().toLocaleLowerCase("nl-NL") === forecast.executorName.trim().toLocaleLowerCase("nl-NL"),
  );

  return {
    planning: {
      id: forecast.id,
      plannedDate: forecast.plannedDate.toISOString().slice(0, 10),
      executorName: forecast.executorName,
      plannedHours: forecast.plannedHours,
      note: forecast.note,
      workPackageCode: forecast.allocation.workPackage.code,
      activityCode: forecast.allocation.activity.code,
      activityName: forecast.allocation.activity.name,
      suggestedActorKey: exactNameMatches.length === 1 ? exactNameMatches[0].key : "",
    },
    actors,
  };
}
