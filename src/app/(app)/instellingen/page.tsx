import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import TherapistRates from "@/components/TherapistRates";

export default async function InstellingenPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const therapists = await prisma.therapist.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Instellingen</h1>
      <p className="text-gray-500 mb-8">Beheer uurtarieven en configuratie.</p>

      <div className="card">
        <h2 className="text-lg font-bold mb-4">Uurtarieven fysiotherapeuten</h2>
        <p className="text-sm text-gray-500 mb-6">
          Stel het uurtarief per fysiotherapeut in. Dit wordt gebruikt voor budgetberekeningen.
        </p>
        <TherapistRates therapists={JSON.parse(JSON.stringify(therapists))} />
      </div>
    </div>
  );
}
