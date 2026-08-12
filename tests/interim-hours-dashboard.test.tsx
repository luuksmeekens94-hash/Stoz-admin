// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InterimHoursDashboard from "@/components/InterimHoursDashboard";
import { buildInterimHoursSteering } from "@/lib/interim-hour-steering";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const steering = buildInterimHoursSteering([
  { budgetCategory: "Praktijkmanager", workPackageCode: "WP1", activityCode: "A1.1", hours: 166 },
  { budgetCategory: "Praktijkmanager", workPackageCode: "WP1", activityCode: "A1.2", hours: 6 },
  { budgetCategory: "Praktijkmanager", workPackageCode: "WP2", activityCode: "A2.2", hours: 6 },
  { budgetCategory: "Praktijkmanager", workPackageCode: "WP2", activityCode: "A2.3", hours: 2 },
  { budgetCategory: "Praktijkmanager", workPackageCode: "WP3", activityCode: "A3.1", hours: 2 },
  { budgetCategory: "Extern adviseur", workPackageCode: "WP1", activityCode: "A1.1", hours: 97 },
  { budgetCategory: "Extern adviseur", workPackageCode: "WP2", activityCode: "A2.1", hours: 41.5 },
  { budgetCategory: "Extern adviseur", workPackageCode: "WP2", activityCode: "A2.2", hours: 30 },
  { budgetCategory: "Extern adviseur", workPackageCode: "WP2", activityCode: "A2.3", hours: 49 },
  { budgetCategory: "Fysiotherapeuten", workPackageCode: "WP2", activityCode: "A2.1", hours: 12 },
  { budgetCategory: "Fysiotherapeuten", workPackageCode: "WP2", activityCode: "A2.2", hours: 39 },
  { budgetCategory: "Fysiotherapeuten", workPackageCode: "WP2", activityCode: "A2.3", hours: 17 },
  { budgetCategory: "Fysiotherapeuten", workPackageCode: "WP3", activityCode: "A3.1", hours: 28 },
  { budgetCategory: "Websitebouwer", workPackageCode: "WP2", activityCode: "A2.1", hours: 26.5 },
  { budgetCategory: "Websitebouwer", workPackageCode: "WP2", activityCode: "A2.2", hours: 10 },
  { budgetCategory: "Websitebouwer", workPackageCode: "WP2", activityCode: "A2.3", hours: 19.5 },
]);

describe("InterimHoursDashboard", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.stubGlobal("crypto", { randomUUID: () => "123e4567-e89b-42d3-a456-426614174000" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ proposalCount: 3, proposalHours: 45 }),
    }));
  });

  it("toont exact de drie gevraagde urensturingstaken in begrijpelijke volgorde", () => {
    render(
      <InterimHoursDashboard
        asOf="2026-08-12"
        steering={steering}
        preparedProposalKeys={[]}
        months={[
          {
            monthKey: "2026-08",
            monthLabel: "augustus 2026",
            totalHours: 26,
            reviewState: "DRAFT",
            roles: [{ label: "Praktijkmanagement", hours: 8, detailCount: 2 }],
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: /1\. realistische stand halverwege/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /2\. huidige registratie naast de doelstand/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /3\. uren vanaf nu per maand/i })).toBeInTheDocument();
    expect(screen.getByText("450 uur")).toBeInTheDocument();
    expect(screen.getByText("551,5 uur")).toBeInTheDocument();
    expect(screen.getAllByText("Praktijkmanagement · implementatie").length).toBeGreaterThan(0);
    expect(screen.getByText("WP5 · Verspreiding en borging")).toBeInTheDocument();
    expect(screen.queryByText(/training aanvullen tot 20 uur/i)).not.toBeInTheDocument();
  });

  it("zet de drie verantwoorde historische aanvullingen met één knop als voorstelset klaar", async () => {
    render(
      <InterimHoursDashboard
        asOf="2026-08-12"
        steering={steering}
        preparedProposalKeys={[]}
        months={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /alle 3 aanvullingen klaarzetten/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/hours/reconstruction/proposals",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    ));
    expect(await screen.findByRole("status")).toHaveTextContent("45 uur verdeeld over 3 aanvullingen staat klaar");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("houdt na het klaarzetten de vervolgstap voor echte datums en uitvoerders zichtbaar", () => {
    render(
      <InterimHoursDashboard
        asOf="2026-08-12"
        steering={steering}
        preparedProposalKeys={steering.proposals.map(
          (proposal) => `${proposal.budgetLineKey}|${proposal.workPackageCode}`,
        )}
        months={[]}
      />,
    );

    expect(screen.getByRole("link", { name: /datums en uitvoerders invullen/i })).toHaveAttribute(
      "href",
      "/uren/reconstructie",
    );
  });

  it("toont bij een niet-JSON serverfout de actiegerichte fout zonder te verversen", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => { throw new SyntaxError("geen JSON"); },
    } as unknown as Response);
    render(
      <InterimHoursDashboard
        asOf="2026-08-12"
        steering={steering}
        preparedProposalKeys={[]}
        months={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /alle 3 aanvullingen klaarzetten/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "De aanvullingen konden niet worden klaargezet.",
    );
    expect(screen.queryByText(/verbindingsfout/i)).not.toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
