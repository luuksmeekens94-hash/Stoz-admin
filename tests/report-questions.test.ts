import { describe, expect, it } from "vitest";
import { buildReportQuestions } from "@/lib/report-questions";

const steering = {
  totals: { reportableHours: 50, unapprovedPastHours: 0, futureHours: 12 },
  participants: [
    { id: "team", category: "Fysiotherapeuten", label: "Fysiotherapieteam", questionableWorkPackageHours: 20, signal: "CHECK_CLASSIFICATION" as const },
  ],
  workPackages: [
    { code: "WP5", name: "Externe verspreiding en borging", reportableHours: 0, futureHours: 0, outsidePhaseHours: 0, signal: "MISSING_REGISTRATION" as const },
  ],
};

const financial = {
  blockers: ["APPROVED_BUDGET_FILE_MISSING", "INVOICE_MAPPING_PENDING", "HOUR_CLASSIFICATION_PENDING", "INVOICE_AMOUNT_INVALID"] as const,
  totals: { pendingInvoiceMappingEuros: 1_000, unmappedInvoiceEuros: 0, classificationPendingEuros: 1_300 },
};

describe("buildReportQuestions", () => {
  it("combineert Model-D-vragen met datagedreven afwijkingen", () => {
    const questions = buildReportQuestions({
      steering,
      financial,
      clientCount: 0,
      trainingCount: 1,
      presentTrainingAttendees: 15,
      trainingHourEntryCount: 13,
      vatRecoverable: false,
      therapistSurveyResponseCount: 0,
    });

    expect(questions.some((row) => row.id === "model-d-planning")).toBe(true);
    expect(questions.some((row) => row.id === "model-d-digitised-processes")).toBe(true);
    expect(questions.some((row) => row.id === "future-hours")).toBe(true);
    expect(questions.some((row) => row.id === "participant-classification-fysiotherapeuten")).toBe(true);
    expect(questions.some((row) => row.id === "missing-registration-WP5")).toBe(true);
    expect(questions.some((row) => row.id === "client-results-missing")).toBe(true);
    expect(questions.some((row) => row.id === "approved-budget-file-missing")).toBe(true);
    expect(questions.some((row) => row.id === "invoice-amount-invalid")).toBe(true);
    expect(questions.some((row) => row.id === "therapist-survey-missing")).toBe(true);
    expect(questions.some((row) => row.id === "training-attendance-reconciliation")).toBe(true);
    expect(questions.some((row) => row.id === "vat-treatment-confirmation")).toBe(true);
    expect(questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "financial-hour-classification-pending",
          priority: "BLOCKER",
          question: expect.stringContaining("€ 1.300"),
        }),
      ]),
    );
  });

  it("neemt beschikbare trainingsfeiten mee zonder daar inhoudelijke impact uit af te leiden", () => {
    const questions = buildReportQuestions({
      steering,
      financial,
      clientCount: 0,
      trainingCount: 1,
      presentTrainingAttendees: 15,
      trainingHourEntryCount: 13,
      vatRecoverable: false,
      therapistSurveyResponseCount: 0,
    });
    const training = questions.find((row) => row.id === "model-d-staff-support");

    expect(training?.knownEvidence).toContain("15 aanwezige deelnemers");
    expect(training?.question).toContain("effect");
  });

  it("neemt ontvangen therapeutmetingen als monitoringbewijs mee zonder effectclaim", () => {
    const questions = buildReportQuestions({
      steering,
      financial,
      clientCount: 0,
      trainingCount: 1,
      presentTrainingAttendees: 15,
      trainingHourEntryCount: 13,
      vatRecoverable: false,
      therapistSurveyResponseCount: 3,
    });
    const monitoring = questions.find((row) => row.id === "model-d-monitoring");

    expect(questions.some((row) => row.id === "therapist-survey-missing")).toBe(false);
    expect(monitoring?.knownEvidence).toContain("3 therapeutresponsen");
    expect(monitoring?.knownEvidence).toContain("geen effectmeting");
  });

  it("vraagt expliciet om duiding zodra een begrote urenrol is overschreden", () => {
    const questions = buildReportQuestions({
      steering: {
        ...steering,
        participants: [
          {
            id: "website",
            category: "Websitebouwer",
            label: "Websitebouwer",
            questionableWorkPackageHours: 0,
            signal: "OVER_BUDGET" as const,
            reportableHours: 56,
            budgetHours: 25,
          },
        ],
      },
      financial,
      clientCount: 1,
      trainingCount: 1,
      presentTrainingAttendees: 5,
      trainingHourEntryCount: 5,
      vatRecoverable: true,
      therapistSurveyResponseCount: 0,
    });

    expect(questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "hours-over-budget-websitebouwer", priority: "BLOCKER" }),
      ]),
    );
  });
});
