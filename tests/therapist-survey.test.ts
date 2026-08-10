import { describe, expect, it } from "vitest";
import {
  THERAPIST_BASELINE_QUESTIONS,
  buildTherapistSurveyEmail,
  buildTherapistSurveySummary,
  createSurveyToken,
  getInvitationAccessStatus,
  hashSurveyToken,
  validateTherapistBaselineAnswers,
} from "@/lib/therapist-survey";

const validAnswers = {
  informationClarity: 3,
  repeatedExplanationFrequency: 4,
  comprehensionProblemFrequency: 3,
  materialsSufficiency: 2,
  extraExplanationMinutes: "11-15",
  missingMaterials: ["CARE_PATH", "EXERCISES"],
  understandingConfidence: 3,
  videoTimeExpectation: 4,
  trainingApplicationFrequency: "SOMETIMES",
  trainingUsefulness: 4,
  expectedChange: "Minder herhaling en meer rust tijdens het consult.",
  anticipatedBarriers: "We moeten de nieuwe materialen eerst goed leren vinden.",
  supportNeeded: "Een korte werkinstructie in het EPD.",
};

describe("therapeutmeting vóór brede implementatie", () => {
  it("bevat een vaste, methodisch passende set zonder patiëntgegevens uit te vragen", () => {
    expect(THERAPIST_BASELINE_QUESTIONS).toHaveLength(13);
    expect(THERAPIST_BASELINE_QUESTIONS.map((question) => question.id)).toEqual(
      Object.keys(validAnswers),
    );
    expect(JSON.stringify(THERAPIST_BASELINE_QUESTIONS).toLowerCase()).not.toContain(
      "naam patiënt",
    );
  });

  it("accepteert een complete respons en weigert ontbrekende of ongeldige waarden", () => {
    expect(validateTherapistBaselineAnswers(validAnswers)).toMatchObject({ ok: true });
    expect(
      validateTherapistBaselineAnswers({ ...validAnswers, informationClarity: 6 }),
    ).toMatchObject({ ok: false });
    const { videoTimeExpectation: _missing, ...incomplete } = validAnswers;
    expect(validateTherapistBaselineAnswers(incomplete)).toMatchObject({ ok: false });
  });

  it("blokkeert duidelijke identificerende cliëntinformatie in vrije tekst", () => {
    expect(
      validateTherapistBaselineAnswers({
        ...validAnswers,
        anticipatedBarriers: "Naam: Jan Jansen, e-mail jan@example.nl",
      }),
    ).toMatchObject({ ok: false, privacyBlocked: true });
  });

  it("bewaart alleen een hash van een cryptografisch willekeurige uitnodigingstoken", () => {
    const token = createSurveyToken();
    const hash = hashSurveyToken(token);

    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashSurveyToken(token)).toBe(hash);
  });

  it("leidt toegang fail-closed af uit campagne, termijn, intrekking en respons", () => {
    const now = new Date("2026-08-09T12:00:00Z");
    const base = {
      campaignStatus: "ACTIVE" as const,
      expiresAt: new Date("2026-09-15T12:00:00Z"),
      revokedAt: null,
      submittedAt: null,
    };

    expect(getInvitationAccessStatus(base, now)).toBe("OPEN");
    expect(getInvitationAccessStatus({ ...base, campaignStatus: "DRAFT" }, now)).toBe("NOT_ACTIVE");
    expect(getInvitationAccessStatus({ ...base, expiresAt: new Date("2026-08-08") }, now)).toBe("EXPIRED");
    expect(getInvitationAccessStatus({ ...base, revokedAt: now }, now)).toBe("REVOKED");
    expect(getInvitationAccessStatus({ ...base, submittedAt: now }, now)).toBe("COMPLETED");
  });

  it("vat responsen brongetrouw samen zonder effectclaim of persoonsnaam", () => {
    const second = {
      ...validAnswers,
      informationClarity: 5,
      missingMaterials: ["EXERCISES"],
      extraExplanationMinutes: "6-10",
      expectedChange: "Cliënten kunnen uitleg thuis terugkijken.",
    };
    const summary = buildTherapistSurveySummary([validAnswers, second]);

    expect(summary.responseCount).toBe(2);
    expect(summary.ratingAverages.informationClarity).toBe(4);
    expect(summary.optionCounts.extraExplanationMinutes).toEqual({ "11-15": 1, "6-10": 1 });
    expect(summary.optionCounts.missingMaterials).toEqual({ CARE_PATH: 1, EXERCISES: 2 });
    expect(summary.openText.expectedChange).toEqual([
      "Minder herhaling en meer rust tijdens het consult.",
      "Cliënten kunnen uitleg thuis terugkijken.",
    ]);
    expect(JSON.stringify(summary)).not.toContain("Jorik");
    expect(summary.interpretation).toContain("geen effectmeting");
  });

  it("maakt een transparante uitnodiging met doel, termijn en unieke link", () => {
    const email = buildTherapistSurveyEmail({
      recipientName: "Jorik",
      campaignName: "Therapeutmeting vóór brede implementatie",
      surveyUrl: "https://example.test/vragenlijst/uniek",
      expiresAt: new Date("2026-09-10T12:00:00Z"),
    });

    expect(email.subject).toContain("Hybride Begrip");
    expect(email.text).toContain("Jorik");
    expect(email.text).toContain("10 september 2026");
    expect(email.text).toContain("https://example.test/vragenlijst/uniek");
    expect(email.text).toContain("geen patiëntgegevens");
  });
});
