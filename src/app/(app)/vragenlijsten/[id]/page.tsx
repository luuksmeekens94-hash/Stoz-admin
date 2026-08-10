import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SurveyCampaignStatusActions, SurveyInvitationActions } from "@/components/SurveyCampaignActions";
import { getSession } from "@/lib/auth";
import { isEmailConfigured } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { buildTherapistSurveySummary, THERAPIST_BASELINE_QUESTIONS } from "@/lib/therapist-survey";

export const dynamic = "force-dynamic";

const statusLabel = { DRAFT: "Concept", ACTIVE: "Actief", CLOSED: "Gesloten" } as const;
const deliveryLabel = { PREPARED: "Link gemaakt", SENT: "E-mail geaccepteerd", FAILED: "Verzending mislukt" } as const;

export default async function SurveyCampaignPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard");

  const campaign = await prisma.surveyCampaign.findUnique({
    where: { id: params.id },
    include: {
      invitations: {
        orderBy: { recipientName: "asc" },
        include: { response: true, deliveries: { orderBy: { attemptedAt: "desc" } } },
      },
    },
  });
  if (!campaign) notFound();

  const completed = campaign.invitations.filter((invitation) => invitation.response).length;
  const answerRecords = campaign.invitations.flatMap((invitation) => {
    const answers = invitation.response?.answers;
    return answers && typeof answers === "object" && !Array.isArray(answers)
      ? [answers as Record<string, unknown>]
      : [];
  });
  const summary = buildTherapistSurveySummary(answerRecords);
  const questionById = new Map<string, (typeof THERAPIST_BASELINE_QUESTIONS)[number]>(
    THERAPIST_BASELINE_QUESTIONS.map((question) => [question.id, question]),
  );
  const sent = campaign.invitations.filter((invitation) => invitation.sentAt).length;
  const canDeliver = campaign.status === "ACTIVE" && campaign.closesAt > new Date();
  const emailConfigured = isEmailConfigured();

  return (
    <div className="space-y-7">
      <header>
        <Link href="/vragenlijsten" className="text-sm font-medium text-primary-700 hover:underline">← Alle therapeutmetingen</Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-primary-700">{statusLabel[campaign.status]} · sluit {campaign.closesAt.toLocaleDateString("nl-NL")}</p><h1 className="mt-1 text-3xl font-bold">{campaign.name}</h1><p className="mt-2 text-gray-600">Persoonlijke uitnodigingen worden per ontvanger voorbereid en verzonden.</p></div>
          <SurveyCampaignStatusActions campaignId={campaign.id} status={campaign.status} />
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card"><p className="text-xs uppercase text-gray-500">Ontvangers</p><p className="mt-2 text-3xl font-bold">{campaign.invitations.length}</p></div>
        <div className="card"><p className="text-xs uppercase text-gray-500">E-mail geaccepteerd</p><p className="mt-2 text-3xl font-bold">{sent}</p></div>
        <div className="card"><p className="text-xs uppercase text-gray-500">Respons</p><p className="mt-2 text-3xl font-bold">{completed}</p><p className="text-sm text-gray-500">{campaign.invitations.length ? Math.round((completed / campaign.invitations.length) * 100) : 0}%</p></div>
      </section>

      <section className={`rounded-xl border p-4 text-sm ${emailConfigured ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
        {emailConfigured ? "SMTP is geconfigureerd. Een uitnodiging telt pas als verzonden nadat de provider de ontvanger accepteert." : "SMTP is nog niet geconfigureerd. Je kunt wel een persoonlijke link maken en handmatig delen; de app registreert dat als ‘link gemaakt’, niet als e-mailverzending."}
      </section>

      <section>
        <div className="mb-3"><h2 className="text-xl font-bold">Ontvangers en leveringsbewijs</h2><p className="text-sm text-gray-600">Een nieuwe link vervangt de vorige token. Deel persoonlijke links niet tussen therapeuten.</p></div>
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">Therapeut</th><th className="px-4 py-3">E-mail</th><th className="px-4 py-3">Laatste levering</th><th className="px-4 py-3">Respons</th><th className="px-4 py-3">Actie</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {campaign.invitations.map((invitation) => {
                  const latest = invitation.deliveries[0];
                  return (
                    <tr key={invitation.id} className="align-top">
                      <td className="px-4 py-4 font-semibold text-gray-950">{invitation.recipientName}</td>
                      <td className="px-4 py-4 text-gray-600">{invitation.recipientEmail}</td>
                      <td className="px-4 py-4">{latest ? <><span className={`font-medium ${latest.status === "FAILED" ? "text-red-700" : latest.status === "SENT" ? "text-emerald-700" : "text-amber-700"}`}>{deliveryLabel[latest.status]}</span><p className="text-xs text-gray-500">{latest.attemptedAt.toLocaleString("nl-NL")}</p></> : <span className="text-gray-400">Nog niet</span>}</td>
                      <td className="px-4 py-4">{invitation.response ? <><span className="font-semibold text-emerald-700">Ontvangen</span><p className="text-xs text-gray-500">{invitation.response.submittedAt.toLocaleString("nl-NL")}</p></> : <span className="text-gray-500">Openstaand</span>}</td>
                      <td className="px-4 py-4"><SurveyInvitationActions invitationId={invitation.id} canDeliver={canDeliver} emailConfigured={emailConfigured} completed={Boolean(invitation.response)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {summary.responseCount > 0 && (
        <section className="space-y-4">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-primary-700">Anonieme samenvatting</p><h2 className="text-xl font-bold">Uitgangssituatie en verwachtingen · n={summary.responseCount}</h2><p className="mt-1 text-sm text-gray-600">{summary.interpretation}</p></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Object.entries(summary.ratingAverages).map(([id, average]) => (
              <div key={id} className="card p-4"><p className="text-sm text-gray-600">{questionById.get(id)?.label}</p><p className="mt-2 text-2xl font-bold text-primary-800">{average.toLocaleString("nl-NL", { maximumFractionDigits: 2 })} <span className="text-sm font-normal text-gray-500">/ 5</span></p></div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {Object.entries(summary.optionCounts).map(([id, counts]) => (
              <div key={id} className="card p-4"><h3 className="font-semibold text-gray-950">{questionById.get(id)?.label}</h3><ul className="mt-3 space-y-2 text-sm">{Object.entries(counts).map(([value, count]) => <li key={value} className="flex justify-between gap-3"><span className="text-gray-600">{questionById.get(id)?.options?.find((option) => option.value === value)?.label || value}</span><strong>{count}</strong></li>)}</ul></div>
            ))}
          </div>
          <details className="card"><summary className="cursor-pointer font-semibold">Anonieme vrije-tekstsignalen</summary><div className="mt-4 grid gap-5 lg:grid-cols-3">{Object.entries(summary.openText).map(([id, texts]) => <div key={id}><h3 className="text-sm font-semibold text-gray-950">{questionById.get(id)?.label}</h3>{texts.length ? <ul className="mt-2 space-y-2 text-sm text-gray-600">{texts.map((text, index) => <li key={`${id}-${index}`} className="rounded-lg bg-gray-50 p-3">“{text}”</li>)}</ul> : <p className="mt-2 text-sm text-gray-400">Geen antwoorden</p>}</div>)}</div></details>
        </section>
      )}

      <section className="card border-blue-200 bg-blue-50"><h2 className="font-semibold text-blue-950">Rapportagegebruik</h2><p className="mt-2 text-sm text-blue-900/80">Gebruik responsaantallen, schaalscores en thema’s als onderbouwing voor monitoring en tussenresultaten. Claim nog geen effect: deze ronde meet de situatie en verwachtingen vóór brede implementatie. Een follow-up na feitelijk gebruik is nodig voor verandering.</p></section>
    </div>
  );
}
