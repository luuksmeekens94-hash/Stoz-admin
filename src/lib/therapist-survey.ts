import { createHash, randomBytes } from "node:crypto";

export type SurveyQuestionType = "RATING" | "SINGLE_CHOICE" | "MULTI_CHOICE" | "TEXT";

export interface SurveyQuestion {
  id:
    | "informationClarity"
    | "repeatedExplanationFrequency"
    | "comprehensionProblemFrequency"
    | "materialsSufficiency"
    | "extraExplanationMinutes"
    | "missingMaterials"
    | "understandingConfidence"
    | "videoTimeExpectation"
    | "trainingApplicationFrequency"
    | "trainingUsefulness"
    | "expectedChange"
    | "anticipatedBarriers"
    | "supportNeeded";
  label: string;
  helpText?: string;
  type: SurveyQuestionType;
  required: boolean;
  options?: Array<{ value: string; label: string }>;
  minLabel?: string;
  maxLabel?: string;
}

const frequencyOptions = [
  { value: "NEVER", label: "Nooit" },
  { value: "RARELY", label: "Zelden" },
  { value: "SOMETIMES", label: "Soms" },
  { value: "OFTEN", label: "Vaak" },
  { value: "ALMOST_ALWAYS", label: "Bijna altijd" },
];

export const THERAPIST_BASELINE_QUESTIONS: SurveyQuestion[] = [
  {
    id: "informationClarity",
    label: "Hoe goed lukt het nu om zorginformatie duidelijk en begrijpelijk uit te leggen?",
    type: "RATING",
    required: true,
    minLabel: "Helemaal niet goed",
    maxLabel: "Zeer goed",
  },
  {
    id: "repeatedExplanationFrequency",
    label: "Hoe vaak moet je dezelfde uitleg tijdens of na een consult herhalen?",
    type: "RATING",
    required: true,
    minLabel: "Nooit",
    maxLabel: "Bijna altijd",
  },
  {
    id: "comprehensionProblemFrequency",
    label: "Hoe vaak merk je dat taal-, lees- of digitale vaardigheden het begrip belemmeren?",
    type: "RATING",
    required: true,
    minLabel: "Nooit",
    maxLabel: "Bijna altijd",
  },
  {
    id: "materialsSufficiency",
    label: "In hoeverre zijn de huidige patiëntmaterialen passend voor mensen met beperkte basisvaardigheden?",
    type: "RATING",
    required: true,
    minLabel: "Helemaal niet passend",
    maxLabel: "Zeer passend",
  },
  {
    id: "extraExplanationMinutes",
    label: "Hoeveel extra uitlegtijd kost dit gemiddeld per consult?",
    type: "SINGLE_CHOICE",
    required: true,
    options: [
      { value: "0-5", label: "0–5 minuten" },
      { value: "6-10", label: "6–10 minuten" },
      { value: "11-15", label: "11–15 minuten" },
      { value: "16-20", label: "16–20 minuten" },
      { value: "21+", label: "Meer dan 20 minuten" },
      { value: "UNKNOWN", label: "Niet goed in te schatten" },
    ],
  },
  {
    id: "missingMaterials",
    label: "Voor welke onderwerpen mis je nu passende uitleg of ondersteuning?",
    helpText: "Meerdere antwoorden mogelijk.",
    type: "MULTI_CHOICE",
    required: true,
    options: [
      { value: "CARE_PATH", label: "Wat fysiotherapie inhoudt en hoe het zorgproces verloopt" },
      { value: "APPOINTMENTS", label: "Afspraken maken, wijzigen en afzeggen" },
      { value: "INSURANCE", label: "Verzekering en vergoeding" },
      { value: "CONDITION", label: "Uitleg over klachten en aandoeningen" },
      { value: "EXERCISES", label: "Oefeningen en thuisinstructies" },
      { value: "NONE", label: "Ik mis op dit moment niets" },
      { value: "OTHER", label: "Anders" },
    ],
  },
  {
    id: "understandingConfidence",
    label: "Hoe zeker ben je dat cliënten je uitleg en instructies na het consult goed begrijpen?",
    type: "RATING",
    required: true,
    minLabel: "Helemaal niet zeker",
    maxLabel: "Zeer zeker",
  },
  {
    id: "videoTimeExpectation",
    label: "In hoeverre verwacht je dat de nieuwe meertalige video’s herhaling en uitlegtijd verminderen?",
    type: "RATING",
    required: true,
    minLabel: "Helemaal niet",
    maxLabel: "In sterke mate",
  },
  {
    id: "trainingApplicationFrequency",
    label: "Hoe vaak pas je sinds de communicatietraining de geleerde aanpak bewust toe?",
    type: "SINGLE_CHOICE",
    required: true,
    options: frequencyOptions,
  },
  {
    id: "trainingUsefulness",
    label: "Hoe bruikbaar was de communicatietraining voor je dagelijkse werk?",
    type: "RATING",
    required: true,
    minLabel: "Niet bruikbaar",
    maxLabel: "Zeer bruikbaar",
  },
  {
    id: "expectedChange",
    label: "Welke verandering verwacht je door de nieuwe video’s en webteksten?",
    helpText: "Noem geen namen, contactgegevens of andere herleidbare patiëntinformatie.",
    type: "TEXT",
    required: true,
  },
  {
    id: "anticipatedBarriers",
    label: "Welke knelpunten verwacht je bij het gebruik in de praktijk?",
    helpText: "Noem geen namen, contactgegevens of andere herleidbare patiëntinformatie.",
    type: "TEXT",
    required: false,
  },
  {
    id: "supportNeeded",
    label: "Welke ondersteuning is nog nodig om de materialen structureel te gebruiken?",
    helpText: "Noem geen namen, contactgegevens of andere herleidbare patiëntinformatie.",
    type: "TEXT",
    required: false,
  },
];

const ratingIds = new Set(
  THERAPIST_BASELINE_QUESTIONS.filter((question) => question.type === "RATING").map(
    (question) => question.id,
  ),
);
const allowedOptions = new Map(
  THERAPIST_BASELINE_QUESTIONS.filter((question) => question.options).map((question) => [
    question.id,
    new Set(question.options!.map((option) => option.value)),
  ]),
);
const textIds = new Set(
  THERAPIST_BASELINE_QUESTIONS.filter((question) => question.type === "TEXT").map(
    (question) => question.id,
  ),
);

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const phonePattern = /(?:\+31|0031|0)\s*6(?:[\s-]*\d){8}\b/;
const bsnPattern = /\b\d{9}\b/;
const labelledIdentifierPattern = /\b(?:naam|geboortedatum|adres|postcode|cliëntnummer|patientnummer|patiëntnummer)\s*:/i;

export function containsObviousPersonalData(value: string) {
  return (
    emailPattern.test(value) ||
    phonePattern.test(value) ||
    bsnPattern.test(value) ||
    labelledIdentifierPattern.test(value)
  );
}

export type TherapistBaselineAnswers = Record<string, number | string | string[]>;

export type SurveyValidationResult =
  | { ok: true; normalized: TherapistBaselineAnswers }
  | { ok: false; errors: Record<string, string>; privacyBlocked?: boolean };

export function validateTherapistBaselineAnswers(input: unknown): SurveyValidationResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: { form: "Ongeldige antwoorden." } };
  }

  const values = input as Record<string, unknown>;
  const errors: Record<string, string> = {};
  const normalized: TherapistBaselineAnswers = {};
  let privacyBlocked = false;

  for (const question of THERAPIST_BASELINE_QUESTIONS) {
    const value = values[question.id];

    if (ratingIds.has(question.id)) {
      if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 5) {
        errors[question.id] = "Kies een score van 1 tot en met 5.";
      } else {
        normalized[question.id] = Number(value);
      }
      continue;
    }

    if (question.type === "SINGLE_CHOICE") {
      if (typeof value !== "string" || !allowedOptions.get(question.id)?.has(value)) {
        errors[question.id] = "Kies één van de beschikbare antwoorden.";
      } else {
        normalized[question.id] = value;
      }
      continue;
    }

    if (question.type === "MULTI_CHOICE") {
      const options = allowedOptions.get(question.id);
      if (
        !Array.isArray(value) ||
        value.length === 0 ||
        value.some((entry) => typeof entry !== "string" || !options?.has(entry)) ||
        (value.includes("NONE") && value.length > 1)
      ) {
        errors[question.id] =
          "Kies minimaal één geldig antwoord; ‘ik mis niets’ kan niet worden gecombineerd.";
      } else {
        normalized[question.id] = Array.from(new Set(value as string[]));
      }
      continue;
    }

    if (textIds.has(question.id)) {
      const text = typeof value === "string" ? value.trim() : "";
      if (question.required && text.length === 0) {
        errors[question.id] = "Dit antwoord is verplicht.";
      } else if (text.length > 1_000) {
        errors[question.id] = "Gebruik maximaal 1.000 tekens.";
      } else if (containsObviousPersonalData(text)) {
        errors[question.id] =
          "Verwijder namen, contactgegevens of andere herleidbare patiëntinformatie.";
        privacyBlocked = true;
      } else {
        normalized[question.id] = text;
      }
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors, privacyBlocked };
  return { ok: true, normalized };
}

export function createSurveyToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSurveyToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export type InvitationAccessStatus =
  | "OPEN"
  | "NOT_ACTIVE"
  | "EXPIRED"
  | "REVOKED"
  | "COMPLETED";

export function getInvitationAccessStatus(
  invitation: {
    campaignStatus: "DRAFT" | "ACTIVE" | "CLOSED";
    expiresAt: Date;
    revokedAt: Date | null;
    submittedAt: Date | null;
  },
  now = new Date(),
): InvitationAccessStatus {
  if (invitation.submittedAt) return "COMPLETED";
  if (invitation.revokedAt) return "REVOKED";
  if (invitation.campaignStatus !== "ACTIVE") return "NOT_ACTIVE";
  if (invitation.expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  return "OPEN";
}

function dateLabel(value: Date) {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(value);
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[
        character
      ]!,
  );
}

export function buildTherapistSurveySummary(
  responses: Array<Record<string, unknown>>,
) {
  const ratingAverages: Record<string, number> = {};
  const optionCounts: Record<string, Record<string, number>> = {};
  const openText: Record<string, string[]> = {};

  for (const question of THERAPIST_BASELINE_QUESTIONS) {
    if (question.type === "RATING") {
      const values = responses
        .map((response) => response[question.id])
        .filter(
          (value): value is number =>
            typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 5,
        );
      ratingAverages[question.id] = values.length
        ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) /
          100
        : 0;
      continue;
    }

    if (question.type === "SINGLE_CHOICE" || question.type === "MULTI_CHOICE") {
      const counts: Record<string, number> = {};
      for (const response of responses) {
        const raw = response[question.id];
        const values = Array.isArray(raw) ? raw : [raw];
        for (const value of values) {
          if (typeof value !== "string") continue;
          counts[value] = (counts[value] || 0) + 1;
        }
      }
      optionCounts[question.id] = Object.fromEntries(
        Object.entries(counts).sort(([a], [b]) => a.localeCompare(b, "nl")),
      );
      continue;
    }

    const texts = responses
      .map((response) => response[question.id])
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim());
    openText[question.id] = texts;
  }

  return {
    responseCount: responses.length,
    ratingAverages,
    optionCounts,
    openText,
    interpretation:
      "Deze ronde beschrijft uitgangssituatie, ervaren bruikbaarheid van de training en verwachtingen vóór brede implementatie; dit is geen effectmeting.",
  };
}

export function buildTherapistSurveyEmail(input: {
  recipientName: string;
  campaignName: string;
  surveyUrl: string;
  expiresAt: Date;
}) {
  const deadline = dateLabel(input.expiresAt);
  const subject = "Uitnodiging therapeutmeting · Hybride Begrip";
  const text = `Beste ${input.recipientName},\n\nVoor het STOZ-project Hybride Begrip nodigen we je uit voor de ${input.campaignName}. De vragen gaan over je huidige werkwijze vóór brede implementatie van de nieuwe meertalige video’s en webteksten. Invullen duurt ongeveer 5 minuten.\n\nGebruik je persoonlijke link vóór ${deadline}:\n${input.surveyUrl}\n\nDeel de link niet. Noem in vrije antwoorden geen patiëntgegevens.\n\nDank je wel,\nProjectteam Hybride Begrip · Fy-fit`;
  const html = `<p>Beste ${escapeHtml(input.recipientName)},</p><p>Voor het STOZ-project <strong>Hybride Begrip</strong> nodigen we je uit voor de ${escapeHtml(input.campaignName)}. De vragen gaan over je huidige werkwijze vóór brede implementatie van de nieuwe meertalige video’s en webteksten. Invullen duurt ongeveer 5 minuten.</p><p><a href="${escapeHtml(input.surveyUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#122E54;color:#fff;text-decoration:none;font-weight:600">Open de therapeutmeting</a></p><p>Je persoonlijke link is geldig tot ${deadline}. Deel de link niet.</p><p><strong>Privacy:</strong> noem in vrije antwoorden geen patiëntgegevens.</p><p>Dank je wel,<br>Projectteam Hybride Begrip · Fy-fit</p>`;
  return { subject, text, html };
}
