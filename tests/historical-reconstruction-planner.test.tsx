// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HistoricalReconstructionPlanner from "@/components/HistoricalReconstructionPlanner";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const props = {
  asOf: "2026-08-10",
  actors: [
    {
      key: "user:u1",
      userId: "u1",
      therapistId: null,
      name: "Testuitvoerder",
      roleLabel: "Projectuitvoering",
    },
  ],
  activities: [
    {
      id: "a1",
      code: "A1.1",
      name: "Testactiviteit",
      workPackageId: "wp1",
      workPackageCode: "WP1",
      workPackageName: "Testwerkpakket",
    },
  ],
  groups: [
    {
      key: "user:u1|a1",
      actorKey: "user:u1",
      activityId: "a1",
      registeredHours: 10,
      approvedHours: 9,
      openHours: 1,
    },
  ],
};

describe("HistoricalReconstructionPlanner", () => {
  beforeEach(() => refresh.mockReset());

  it("koppelt reconstructievelden aan hun zichtbare labels", () => {
    render(<HistoricalReconstructionPlanner {...props} />);
    fireEvent.click(
      screen.getByRole("button", { name: /^Verschil beoordelen voor Testuitvoerder/ }),
    );

    expect(screen.getByLabelText(/Werkelijk uitgevoerd totaal/)).toHaveValue(null);
    fireEvent.change(screen.getByLabelText(/Werkelijk uitgevoerd totaal/), {
      target: { value: "10.25" },
    });
    expect(screen.getByLabelText("Werkelijke uitvoeringsdatum")).toHaveValue("");
    expect(screen.getByLabelText("Uren in deze conceptregel")).toHaveValue(null);
  });

  it("houdt de knop uit wanneer concepturen groter zijn dan het berekende verschil", () => {
    render(<HistoricalReconstructionPlanner {...props} />);
    fireEvent.click(
      screen.getByRole("button", { name: /^Verschil beoordelen voor Testuitvoerder/ }),
    );
    fireEvent.change(screen.getByLabelText(/Werkelijk uitgevoerd totaal/), {
      target: { value: "10.25" },
    });
    fireEvent.change(screen.getByLabelText("Werkelijke uitvoeringsdatum"), {
      target: { value: "2026-08-01" },
    });
    fireEvent.change(screen.getByLabelText("Uren in deze conceptregel"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("Werkzaamheden"), {
      target: { value: "Concrete testwerkzaamheden voor de reconstructie" },
    });
    fireEvent.change(screen.getByLabelText("Bron of onderbouwing"), {
      target: { value: "Agenda en projectnotulen van de betreffende uitvoeringsmaand." },
    });
    fireEvent.click(screen.getByRole("checkbox"));

    const submitButton = screen.getByRole("button", { name: "Conceptregistratie aanmaken" });
    expect(submitButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Uren in deze conceptregel"), {
      target: { value: "0.25" },
    });
    expect(submitButton).toBeEnabled();
  });
});
