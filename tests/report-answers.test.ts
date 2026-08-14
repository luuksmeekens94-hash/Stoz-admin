import { describe, expect, it } from "vitest";
import { resolveReportQuestions } from "@/lib/report-answers";
import { buildReportQuestions, type BuildReportQuestionsInput } from "@/lib/report-questions";

function input(overrides: Partial<BuildReportQuestionsInput> = {}): BuildReportQuestionsInput {
  return {
    steering: {
      totals: { reportableHours: 551.5, unapprovedPastHours: 0, futureHours: 0 },
      participants: [],
      workPackages: [],
    },
    financial: {
      blockers: [],
      totals: {
        pendingInvoiceMappingEuros: 0,
        unmappedInvoiceEuros: 0,
        classificationPendingEuros: 0,
      },
    },
    clientCount: 1,
    trainingCount: 1,
    presentTrainingAttendees: 15,
    trainingHourEntryCount: 15,
    vatRecoverable: true,
    therapistSurveyResponseCount: 1,
    ...overrides,
  };
}

describe("resolveReportQuestions", () => {
  it("markeert alle eerder beantwoorde vaste Model D-vragen als verwerkt", () => {
    const questions = buildReportQuestions(input());
    const result = resolveReportQuestions(questions);

    expect(result.openQuestions).toEqual([]);
    expect(result.resolvedAnswers.map((answer) => answer.question.id)).toEqual(
      expect.arrayContaining([
        "model-d-planning",
        "model-d-bottlenecks",
        "model-d-external-developments",
        "model-d-digitised-processes",
        "model-d-implementation",
        "model-d-embedding",
        "model-d-staff-support",
        "model-d-clients",
        "model-d-monitoring",
        "model-d-impact",
        "model-d-knowledge-sharing",
        "model-d-purchaser",
        "model-d-supplier",
        "model-d-other-parties",
      ]),
    );
  });

  it("laat een nieuwe niet-beantwoorde datakwaliteitsvraag wel openstaan", () => {
    const questions = buildReportQuestions(
      input({
        steering: {
          totals: { reportableHours: 551.5, unapprovedPastHours: 2, futureHours: 0 },
          participants: [],
          workPackages: [],
        },
      }),
    );
    const result = resolveReportQuestions(questions);

    expect(result.openQuestions.map((question) => question.id)).toEqual(["unapproved-hours"]);
  });

  it("sluit toekomstige dynamische budget- of classificatievragen niet generiek af", () => {
    const result = resolveReportQuestions([
      {
        id: "hours-over-budget-nieuwe-activiteit",
        section: "Financieel",
        priority: "BLOCKER",
        question: "Wat verklaart deze nieuwe budgetoverschrijding?",
        reason: "Nieuwe vraag vereist projectspecifieke onderbouwing.",
      },
      {
        id: "participant-classification-nieuwe-deelnemer",
        section: "Datakwaliteit",
        priority: "HIGH",
        question: "Onder welke bevestigde begrotingsregel valt deze deelnemer?",
        reason: "Nieuwe deelnemer is nog niet inhoudelijk geclassificeerd.",
      },
    ]);

    expect(result.resolvedAnswers).toEqual([]);
    expect(result.openQuestions.map((question) => question.id)).toEqual([
      "hours-over-budget-nieuwe-activiteit",
      "participant-classification-nieuwe-deelnemer",
    ]);
  });

  it("gebruikt stabiele categorie-id's en verwerkt de bevestigde website- en fysiotherapieafwijkingen", () => {
    const questions = buildReportQuestions(
      input({
        steering: {
          totals: { reportableHours: 551.5, unapprovedPastHours: 0, futureHours: 0 },
          participants: [
            {
              id: "database-id-website",
              category: "Websitebouwer",
              label: "Websiteleverancier",
              questionableWorkPackageHours: 0,
              signal: "OVER_BUDGET",
              reportableHours: 56,
              budgetHours: 25,
            },
            {
              id: "database-id-fysio",
              category: "Fysiotherapeuten",
              label: "Fysiotherapieteam",
              questionableWorkPackageHours: 0,
              signal: "OVER_BUDGET",
              reportableHours: 96,
              budgetHours: 60,
            },
          ],
          workPackages: [],
        },
      }),
    );
    const result = resolveReportQuestions(questions);

    expect(questions.map((question) => question.id)).toEqual(
      expect.arrayContaining([
        "hours-over-budget-websitebouwer",
        "hours-over-budget-fysiotherapeuten",
      ]),
    );
    expect(result.openQuestions).toEqual([]);
    expect(
      result.resolvedAnswers.find(
        (answer) => answer.question.id === "hours-over-budget-websitebouwer",
      )?.answer,
    ).toMatch(/SEO|Arabische|Turkse/i);
    expect(
      result.resolvedAnswers.find(
        (answer) => answer.question.id === "hours-over-budget-fysiotherapeuten",
      )?.answer,
    ).toMatch(/68 uur.*implementatie.*28 uur.*opleiding/i);
    expect(
      result.resolvedAnswers.find(
        (answer) => answer.question.id === "hours-over-budget-fysiotherapeuten",
      )?.answer,
    ).toMatch(/€35.*buiten Model B/i);
    const websiteAnswer = result.resolvedAnswers.find(
      (answer) => answer.question.id === "hours-over-budget-websitebouwer",
    );
    const physiotherapistAnswer = result.resolvedAnswers.find(
      (answer) => answer.question.id === "hours-over-budget-fysiotherapeuten",
    );
    expect(websiteAnswer?.decidedOn).toBe("2026-08-14");
    expect(physiotherapistAnswer?.decidedOn).toBe("2026-08-14");
    expect(physiotherapistAnswer?.answer).toMatch(
      /60 uur.*verleende.*8 implementatie-uren.*formele herverdeling/i,
    );
    expect(physiotherapistAnswer?.answer).not.toMatch(/68 uur onder subsidiabele/i);
  });

  it("dateert alleen de nieuwe tariefbesluiten op 14 augustus", () => {
    const questions = buildReportQuestions(input({
      financial: {
        blockers: [],
        totals: {
          pendingInvoiceMappingEuros: 0,
          unmappedInvoiceEuros: 0,
          classificationPendingEuros: 980,
        },
      },
    }));
    const result = resolveReportQuestions(questions);

    expect(
      result.resolvedAnswers.find(
        (answer) => answer.question.id === "financial-hour-classification-pending",
      )?.decidedOn,
    ).toBe("2026-08-14");
    expect(
      result.resolvedAnswers.find(
        (answer) => answer.question.id === "model-d-planning",
      )?.decidedOn,
    ).toBe("2026-08-10");
  });

  it("reconcilieert WP3-deelname als niet-subsidiabele operationele inzet", () => {
    const questions = buildReportQuestions(input({ trainingHourEntryCount: 14 }));
    const reconciliationQuestion = questions.find(
      (question) => question.id === "training-attendance-reconciliation",
    );
    const answer = resolveReportQuestions(questions).resolvedAnswers.find(
      (resolved) => resolved.question.id === "training-attendance-reconciliation",
    );

    expect(reconciliationQuestion?.question).toMatch(/aantoonbaar deelnamen.*niet-subsidiabele.*€35.*buiten Model B/i);
    expect(answer?.answer).toMatch(/bevestigde training.*maximaal twee.*€35.*buiten Model B/i);
    expect(answer?.answer).not.toMatch(/Iedere aanwezige deelnemer mag twee/i);
    expect(answer?.decidedOn).toBe("2026-08-14");
  });
});
