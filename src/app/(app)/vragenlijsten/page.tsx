import Link from "next/link";
import { redirect } from "next/navigation";
import SurveyCampaignForm from "@/components/SurveyCampaignForm";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const statusLabel = { DRAFT: "Concept", ACTIVE: "Actief", CLOSED: "Gesloten" } as const;
const statusClass = { DRAFT: "bg-gray-100 text-gray-700", ACTIVE: "bg-emerald-100 text-emerald-800", CLOSED: "bg-red-100 text-red-800" } as const;

export default async function SurveysPage() {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard");

  const [campaigns, therapists] = await Promise.all([
    prisma.surveyCampaign.findMany({
      orderBy: { createdAt: "desc" },
      include: { invitations: { include: { response: true } } },
    }),
    prisma.therapist.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary-700">Monitoring en evaluatie · WP6</p>
        <h1 className="mt-1 text-3xl font-bold">Therapeutmetingen</h1>
        <p className="mt-2 max-w-3xl text-gray-600">Maak een gecontroleerde meting vóór brede implementatie. Iedere therapeut krijgt een persoonlijke link; verzending en respons worden afzonderlijk vastgelegd.</p>
      </header>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div>
          <h2 className="mb-3 text-xl font-bold">Nieuwe conceptcampagne</h2>
          <SurveyCampaignForm therapists={therapists} />
        </div>
        <div>
          <h2 className="mb-3 text-xl font-bold">Campagnes</h2>
          <div className="space-y-3">
            {campaigns.map((campaign) => {
              const completed = campaign.invitations.filter((invitation) => invitation.response).length;
              return (
                <Link key={campaign.id} href={`/vragenlijsten/${campaign.id}`} className="card block transition hover:border-primary-300 hover:shadow-md">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><h3 className="font-semibold text-gray-950">{campaign.name}</h3><p className="mt-1 text-sm text-gray-500">Sluit {campaign.closesAt.toLocaleDateString("nl-NL")}</p></div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[campaign.status]}`}>{statusLabel[campaign.status]}</span>
                  </div>
                  <div className="mt-4 flex gap-5 text-sm text-gray-600"><span>{campaign.invitations.length} uitgenodigd</span><span>{completed} ingevuld</span><span>{campaign.invitations.length ? Math.round((completed / campaign.invitations.length) * 100) : 0}% respons</span></div>
                </Link>
              );
            })}
            {campaigns.length === 0 && <div className="card text-center text-gray-500">Nog geen therapeutmetingen aangemaakt.</div>}
          </div>
        </div>
      </section>
    </div>
  );
}
