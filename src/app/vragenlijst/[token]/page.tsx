import TherapistSurveyForm from "@/components/TherapistSurveyForm";
import { prisma } from "@/lib/prisma";
import { getInvitationAccessStatus, hashSurveyToken, THERAPIST_BASELINE_QUESTIONS } from "@/lib/therapist-survey";

export const dynamic = "force-dynamic";

function statusContent(status: ReturnType<typeof getInvitationAccessStatus>) {
  if (status === "COMPLETED") return { title: "Deze meting is al ingevuld", text: "Bedankt. De persoonlijke link kan maar één keer worden gebruikt." };
  if (status === "EXPIRED") return { title: "Deze uitnodiging is verlopen", text: "Vraag het projectteam om een nieuwe uitnodiging als je nog wilt deelnemen." };
  if (status === "REVOKED") return { title: "Deze uitnodiging is ingetrokken", text: "Neem contact op met het projectteam als dit onverwacht is." };
  return { title: "Deze meting is nog niet actief", text: "Het projectteam heeft de campagne nog niet geopend of inmiddels gesloten." };
}

export default async function PublicSurveyPage({ params }: { params: { token: string } }) {
  const invitation = params.token?.length >= 40 && params.token.length <= 100
    ? await prisma.surveyInvitation.findUnique({
        where: { tokenHash: hashSurveyToken(params.token) },
        include: { campaign: true, response: true },
      })
    : null;

  if (!invitation) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-16">
        <div className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold">Uitnodigingslink ongeldig</h1>
          <p className="mt-2 text-gray-600">Controleer of je de volledige persoonlijke link hebt geopend.</p>
        </div>
      </main>
    );
  }

  const status = getInvitationAccessStatus({
    campaignStatus: invitation.campaign.status,
    expiresAt: invitation.expiresAt,
    revokedAt: invitation.revokedAt,
    submittedAt: invitation.response?.submittedAt || null,
  });
  if (status !== "OPEN") {
    const content = statusContent(status);
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-16">
        <div className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold">{content.title}</h1>
          <p className="mt-2 text-gray-600">{content.text}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 rounded-2xl bg-gradient-to-br from-slate-950 via-blue-950 to-primary-800 p-6 text-white shadow-lg sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-200">STOZ · Hybride Begrip · Fy-fit</p>
          <h1 className="mt-2 text-3xl font-bold">{invitation.campaign.name}</h1>
          <p className="mt-3 text-blue-100">Beste {invitation.recipientName}, deze meting duurt ongeveer 5 minuten en helpt ons de situatie vóór brede implementatie vast te leggen.</p>
        </header>
        <TherapistSurveyForm token={params.token} questions={THERAPIST_BASELINE_QUESTIONS} />
      </div>
    </main>
  );
}
