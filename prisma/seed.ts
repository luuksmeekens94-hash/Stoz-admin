import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Users
  const users = [
    { email: "luuk.smeekens@outlook.com", name: "Luuk Smeekens", role: Role.ADMIN },
    { email: "marion@fysiotherapienijmegen.nl", name: "Marion Brouwer", role: Role.INTERNAL },
    { email: "sjoerd@fysiotherapienijmegen.nl", name: "Sjoerd Hendriks", role: Role.INTERNAL },
    { email: "heidi@fysiotherapienijmegen.nl", name: "Heidi Staring", role: Role.INTERNAL },
    { email: "ltromp@symbiomarketing.nl", name: "Lodewijk Tromp", role: Role.EXTERNAL },
    { email: "team@fysiotherapienijmegen.nl", name: "Fysiotherapeuten Fy-fit", role: Role.TEAM },
  ];

  const createdUsers: Record<string, string> = {};
  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role },
      create: u,
    });
    createdUsers[u.email] = user.id;
    console.log(`  ✓ User: ${u.name} (${u.role})`);
  }

  // Work Packages & Activities
  const workPackages = [
    {
      code: "WP1",
      name: "Projectcoördinatie",
      activities: [
        { code: "A1.1", name: "Projectmanagement" },
        { code: "A1.2", name: "Kick-off" },
      ],
    },
    {
      code: "WP2",
      name: "Contentontwikkeling",
      activities: [
        { code: "A2.1", name: "Technisch" },
        { code: "A2.2", name: "Teksten" },
        { code: "A2.3", name: "Video's" },
      ],
    },
    {
      code: "WP3",
      name: "Scholing",
      activities: [
        { code: "A3.1", name: "Training communicatie" },
        { code: "A3.2", name: "Instructie tools" },
      ],
    },
    {
      code: "WP4",
      name: "Implementatie",
      activities: [
        { code: "A4.1", name: "Pilot Meijhorst" },
        { code: "A4.2", name: "Uitrol praktijk" },
      ],
    },
    {
      code: "WP5",
      name: "Verspreiding en borging",
      activities: [
        { code: "A5.1", name: "Kennisdeling" },
        { code: "A5.2", name: "Opschaling" },
      ],
    },
    {
      code: "WP6",
      name: "Monitoring en evaluatie",
      activities: [
        { code: "A6.1", name: "Monitoring" },
        { code: "A6.2", name: "Evaluatie" },
      ],
    },
  ];

  for (const wp of workPackages) {
    const created = await prisma.workPackage.upsert({
      where: { code: wp.code },
      update: { name: wp.name },
      create: { code: wp.code, name: wp.name },
    });

    for (const act of wp.activities) {
      await prisma.activity.upsert({
        where: { code: act.code },
        update: { name: act.name, workPackageId: created.id },
        create: { code: act.code, name: act.name, workPackageId: created.id },
      });
    }
    console.log(`  ✓ ${wp.code}: ${wp.name} (${wp.activities.length} activiteiten)`);
  }

  // Budget Allocations
  const marionId = createdUsers["marion@fysiotherapienijmegen.nl"];
  const sjoerdId = createdUsers["sjoerd@fysiotherapienijmegen.nl"];
  const heidiId = createdUsers["heidi@fysiotherapienijmegen.nl"];
  const luukId = createdUsers["luuk.smeekens@outlook.com"];
  const teamId = createdUsers["team@fysiotherapienijmegen.nl"];

  // Clear existing allocations
  await prisma.budgetAllocation.deleteMany();

  const budgets = [
    // Praktijkmanager/houders - split per person (490 total / 3 ≈ 163.33 each)
    { userId: marionId, category: "Praktijkmanager", budgetHours: 163.33, hourlyRate: 50, description: "PM/houder - Marion" },
    { userId: sjoerdId, category: "Praktijkmanager", budgetHours: 163.33, hourlyRate: 50, description: "PM/houder - Sjoerd" },
    { userId: heidiId, category: "Praktijkmanager", budgetHours: 163.34, hourlyRate: 50, description: "PM/houder - Heidi" },
    // Fysiotherapeuten team
    { userId: teamId, category: "Fysiotherapeuten", budgetHours: 60, hourlyRate: 50, description: "Fysiotherapeuten team" },
    // Front/backoffice
    { userId: null, category: "Front/backoffice", budgetHours: 20, hourlyRate: 50, description: "Front- en backoffice" },
    // Luuk extern
    { userId: luukId, category: "Extern adviseur", budgetHours: 325, hourlyRate: 100, description: "Luuk Smeekens - kosten derden" },
    // Websitebouwer
    { userId: null, category: "Websitebouwer", budgetHours: 25, hourlyRate: 100, description: "Websitebouwer extern" },
    // Taalambassadeurs
    { userId: null, category: "Taalambassadeurs", budgetHours: 20, hourlyRate: 0, description: "Taalambassadeurs (vrijwillig)" },
  ];

  for (const b of budgets) {
    await prisma.budgetAllocation.create({ data: b });
  }
  console.log(`  ✓ ${budgets.length} budget allocations`);

  console.log("\n✅ Seed complete!");
  console.log("\nProject totals:");
  console.log("  Totale kosten: €80.160");
  console.log("  STOZ subsidie: €39.410");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
