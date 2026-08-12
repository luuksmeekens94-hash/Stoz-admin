// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InterimProposalMaterializer from "@/components/InterimProposalMaterializer";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const proposal = {
  id: "proposal-1",
  title: "Interne opleider",
  workPackageCode: "WP3",
  activityCode: "A3.1",
  activityName: "Training communicatie",
  targetHours: 20,
  currentHours: 2,
  remainingHours: 18,
  actors: [
    {
      key: "user:manager",
      userId: "manager",
      therapistId: null,
      name: "Praktijkmanager",
      roleLabel: "Praktijkmanager",
    },
  ],
  suggestions: [
    {
      key: "proposal-1-1",
      actorKey: "user:manager",
      actorName: "Praktijkmanager",
      date: "2026-07-09",
      hours: 4,
      description: "Communicatietraining voorbereid en afgestemd met het behandelteam.",
    },
  ],
};

describe("InterimProposalMaterializer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    refresh.mockReset();
    vi.stubGlobal("crypto", { randomUUID: () => "123e4567-e89b-42d3-a456-426614174000" });
  });

  it("vult de gekozen persoons-, datum- en werksuggestie in maar laat bewijs en bevestiging expliciet open", () => {
    render(<InterimProposalMaterializer asOf="2026-08-12" proposals={[proposal]} />);

    fireEvent.click(screen.getByRole("button", { name: /interne opleider invullen/i }));

    fireEvent.click(screen.getByRole("button", { name: /suggestie voor praktijkmanager op 9 juli/i }));

    expect(screen.getByLabelText(/uitvoerder/i)).toHaveValue("user:manager");
    expect(screen.getByLabelText(/werkelijke uitvoeringsdatum/i)).toHaveValue("2026-07-09");
    expect(screen.getByLabelText(/uren in deze conceptregel/i)).toHaveValue(4);
    expect(screen.getByRole("textbox", { name: /^werkzaamheden$/i })).toHaveValue(proposal.suggestions[0].description);
    expect(screen.getByRole("textbox", { name: /bron of onderbouwing/i })).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: /daadwerkelijk/i })).not.toBeChecked();
    expect(screen.getByRole("button", { name: /conceptregistratie aanmaken/i })).toBeDisabled();
  });

  it("maakt na volledige bevestiging één gekoppelde conceptregel", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ remainingHours: 0 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<InterimProposalMaterializer asOf="2026-08-12" proposals={[proposal]} />);

    fireEvent.click(screen.getByRole("button", { name: /interne opleider invullen/i }));
    fireEvent.change(screen.getByLabelText(/uitvoerder/i), { target: { value: "user:manager" } });
    fireEvent.change(screen.getByLabelText(/werkelijke uitvoeringsdatum/i), { target: { value: "2026-07-10" } });
    fireEvent.change(screen.getByRole("textbox", { name: /werkzaamheden/i }), {
      target: { value: "Voorbereiding en uitvoering van de communicatietraining voor de praktijk." },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /bron of onderbouwing/i }), {
      target: { value: "Outlook-agenda 10 juli 2026 en het opgeleverde trainingsmateriaal." },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /daadwerkelijk/i }));
    fireEvent.click(screen.getByRole("button", { name: /conceptregistratie aanmaken/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/hours/reconstruction/proposals/proposal-1/entries",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      userId: "manager",
      therapistId: null,
      date: "2026-07-10",
      hours: 18,
      performedConfirmation: true,
    });
    expect(await screen.findByRole("status")).toHaveTextContent(/concept van 18 uur aangemaakt/i);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("toont bij een niet-JSON serverfout de conceptfout zonder te verversen", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => { throw new SyntaxError("geen JSON"); },
    }));
    render(<InterimProposalMaterializer asOf="2026-08-12" proposals={[proposal]} />);
    fireEvent.click(screen.getByRole("button", { name: /interne opleider invullen/i }));
    fireEvent.change(screen.getByLabelText(/uitvoerder/i), { target: { value: "user:manager" } });
    fireEvent.change(screen.getByLabelText(/werkelijke uitvoeringsdatum/i), { target: { value: "2026-07-10" } });
    fireEvent.change(screen.getByRole("textbox", { name: /werkzaamheden/i }), {
      target: { value: "Voorbereiding en uitvoering van de communicatietraining voor de praktijk." },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /bron of onderbouwing/i }), {
      target: { value: "Outlook-agenda 10 juli 2026 en het opgeleverde trainingsmateriaal." },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /daadwerkelijk/i }));
    fireEvent.click(screen.getByRole("button", { name: /conceptregistratie aanmaken/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "De conceptregistratie kon niet worden aangemaakt.",
    );
    expect(screen.queryByText(/verbindingsfout/i)).not.toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
