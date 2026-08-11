// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HistoricalReconstructionPlanner from "@/components/HistoricalReconstructionPlanner";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const actors = [
  {
    key: "user:manager",
    userId: "manager",
    therapistId: null,
    name: "Praktijkmanager",
    roleLabel: "Praktijkmanager",
  },
];
const activities = [
  {
    id: "activity-training",
    code: "A3.1",
    name: "Training communicatie",
    workPackageId: "wp3",
    workPackageCode: "WP3",
    workPackageName: "Training",
  },
];

describe("HistoricalReconstructionPlanner aanvulvoorstel", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.stubGlobal("crypto", { randomUUID: () => "request-id" });
  });

  it("zet het bevestigde trainingsverschil met één knop klaar en laat alleen de datum nog open", () => {
    render(
      <HistoricalReconstructionPlanner
        asOf="2026-08-11"
        actors={actors}
        activities={activities}
        groups={[
          {
            key: "user:manager|activity-training",
            actorKey: "user:manager",
            activityId: "activity-training",
            registeredHours: 2,
            approvedHours: 2,
            openHours: 0,
          },
        ]}
        suggestions={[
          {
            id: "training-catch-up",
            title: "Training aanvullen tot 20 uur",
            actorKey: "user:manager",
            activityId: "activity-training",
            targetHours: 20,
            description:
              "Voorbereiding, afstemming en uitvoering van de praktijktraining over communicatie en hybride ondersteuning.",
            sourceReference:
              "Besluit projecteigenaar 11 augustus 2026: deze trainingswerkzaamheden zijn daadwerkelijk uitgevoerd.",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /training aanvullen tot 20 uur/i }));

    expect(screen.getByLabelText(/werkelijk uitgevoerd totaal/i)).toHaveValue(20);
    expect(screen.getByLabelText(/uren in deze conceptregel/i)).toHaveValue(18);
    expect(screen.getByLabelText(/werkelijke uitvoeringsdatum/i)).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Werkzaamheden" })).toHaveValue(
      "Voorbereiding, afstemming en uitvoering van de praktijktraining over communicatie en hybride ondersteuning.",
    );
    expect(screen.getByLabelText(/bron of onderbouwing/i)).toHaveValue(
      "Besluit projecteigenaar 11 augustus 2026: deze trainingswerkzaamheden zijn daadwerkelijk uitgevoerd.",
    );
    expect(screen.getByRole("checkbox")).toBeChecked();
  });
});
