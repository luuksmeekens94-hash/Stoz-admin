import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const entries = await prisma.hourEntry.findMany({
    include: { user: true, therapist: true, workPackage: true, activity: true },
    orderBy: [{ date: "asc" }, { userId: "asc" }],
  });
  const asOf = "2026-08-09";
  const map = new Map<string, { account: string; actor: string; past: number; future: number; byWp: Record<string, number>; descriptions: Set<string> }>();
  for (const row of entries) {
    const actor = row.therapist?.name || row.user.name;
    const key = `${row.user.email}::${actor}`;
    const item = map.get(key) || { account: row.user.name, actor, past: 0, future: 0, byWp: {}, descriptions: new Set<string>() };
    const date = row.date.toISOString().slice(0, 10);
    if (date <= asOf) item.past += row.hours;
    else item.future += row.hours;
    item.byWp[row.workPackage.code] = (item.byWp[row.workPackage.code] || 0) + row.hours;
    item.descriptions.add(row.description);
    map.set(key, item);
  }
  console.log(JSON.stringify(Array.from(map.values()).map((item) => ({
    ...item,
    past: Math.round(item.past * 100) / 100,
    future: Math.round(item.future * 100) / 100,
    descriptions: Array.from(item.descriptions).slice(0, 12),
  })), null, 2));
}

main().finally(() => prisma.$disconnect());
