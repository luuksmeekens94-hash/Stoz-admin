import { prisma } from "@/lib/prisma";
import { CATEGORY_USER_EMAILS } from "@/lib/project-plan";
import { buildInterimHoursSteering } from "@/lib/interim-hour-steering";

export const INTERIM_CALCULATION_VERSION = "phase-estimate-2026-08-v2";
export const INTERIM_PROPOSAL_CREATE_ACTION = "CREATED_INTERIM_CATCH_UP_PROPOSAL_SET";

const interimCategoryByEmail = new Map(
  Object.entries(CATEGORY_USER_EMAILS).map(([category, email]) => [email.toLowerCase(), category]),
);

export function resolveInterimBudgetCategory(
  user: { id: string; email: string },
  categoryByUserId: ReadonlyMap<string, string>,
) {
  return categoryByUserId.get(user.id) || interimCategoryByEmail.get(user.email.toLowerCase()) || null;
}

export interface InterimSteeringDbClient {
  hourEntry: Pick<typeof prisma.hourEntry, "findMany">;
  budgetAllocation: Pick<typeof prisma.budgetAllocation, "findMany">;
}

export async function loadInterimHoursSteering(
  asOf: string,
  client: InterimSteeringDbClient = prisma,
) {
  const asOfEnd = new Date(`${asOf}T23:59:59.999Z`);
  const [entries, allocations] = await Promise.all([
    client.hourEntry.findMany({
      where: { date: { lte: asOfEnd } },
      select: {
        hours: true,
        userId: true,
        user: { select: { email: true } },
        workPackage: { select: { code: true } },
        activity: { select: { code: true } },
      },
    }),
    client.budgetAllocation.findMany({
      where: { userId: { not: null } },
      select: { userId: true, category: true },
    }),
  ]);

  const categoryByUserId = new Map(
    allocations.flatMap((row) => (row.userId ? [[row.userId, row.category] as const] : [])),
  );
  return buildInterimHoursSteering(
    entries.flatMap((entry) => {
      const budgetCategory = resolveInterimBudgetCategory(
        { id: entry.userId, email: entry.user.email },
        categoryByUserId,
      );
      if (!budgetCategory) return [];
      return [{
        budgetCategory,
        workPackageCode: entry.workPackage.code,
        activityCode: entry.activity.code,
        hours: entry.hours,
      }];
    }),
  );
}

export async function loadPreparedInterimProposalKeys(asOf: string): Promise<string[]> {
  const sets = await prisma.interimHourProposalSet.findMany({
    where: {
      asOf: new Date(`${asOf}T00:00:00.000Z`),
      calculationVersion: INTERIM_CALCULATION_VERSION,
    },
    select: {
      proposals: {
        where: { proposedQuarters: { gt: 0 } },
        select: { budgetLineKey: true, workPackage: { select: { code: true } } },
      },
    },
  });
  return Array.from(new Set<string>(
    sets.flatMap((set) => set.proposals.map((proposal) => `${proposal.budgetLineKey}|${proposal.workPackage.code}`)),
  ));
}

export function proposalHours(proposals: Array<{ proposedHours: number }>) {
  return Math.round(proposals.reduce((sum, proposal) => sum + proposal.proposedHours, 0) * 100) / 100;
}
