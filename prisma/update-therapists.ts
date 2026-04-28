import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // New therapists to add
  const newTherapists = [
    'Bram Heldens',
    'Fleur Frieling',
    'Tom van Haaren',
    'Esmee van der Veld',
    'Harm Kersten',
    'Jorik Hof',
    'Jordi Derks',
  ];

  for (const name of newTherapists) {
    const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    await prisma.therapist.upsert({
      where: { id },
      update: {},
      create: { id, name, hourlyRate: null },
    });
    console.log(`+ ${name}`);
  }

  // Rename Mark Reijnen-Thoonsen → Mark Reynen
  try {
    await prisma.therapist.update({
      where: { id: 'mark-reijnen-thoonsen' },
      data: { name: 'Mark Reynen' },
    });
    console.log('~ Mark Reijnen-Thoonsen → Mark Reynen');
  } catch { console.log('Mark not found, skipping'); }

  // Deactivate removed therapists
  const deactivate = ['esther-reijmerink', 'chantal-graafmans', 'anouk-peters'];
  for (const id of deactivate) {
    try {
      await prisma.therapist.update({ where: { id }, data: { active: false } });
      console.log(`- Deactivated: ${id}`);
    } catch { console.log(`${id} not found`); }
  }

  const active = await prisma.therapist.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  console.log(`\nTotaal actief: ${active.length}`);
  active.forEach(t => console.log(`  ${t.name}`));
}

main().then(() => prisma.$disconnect());
