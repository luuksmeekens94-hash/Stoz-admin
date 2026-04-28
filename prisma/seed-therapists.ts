import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const therapists = [
  'Koen Lensen',
  'Ryan Wessels',
  'Auke Huinink',
  'Dave van Perlo',
  'Esther Reijmerink',
  'Mark Reijnen-Thoonsen',
  'Anne Bronsema',
  'Daphne van den Heiligenberg',
  'Chantal Graafmans',
  'Anouk Peters',
  'Manon van Wezel',
  'Jolijn van Venrooij',
  'Claudia Graafmans',
  'Beate Schellekens',
  'Ties Luft',
  'Glenn Hellegers',
];

async function main() {
  for (const name of therapists) {
    await prisma.therapist.upsert({
      where: { id: name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') },
      update: {},
      create: {
        id: name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        name,
        hourlyRate: null, // te configureren
      },
    });
    console.log(`✓ ${name}`);
  }
}

main().then(() => prisma.$disconnect());
