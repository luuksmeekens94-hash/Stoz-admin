// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MonthlyPlanningApprovalBoard from "@/components/MonthlyPlanningApprovalBoard";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

describe("MonthlyPlanningApprovalBoard", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });

  it("toont uren per functie en keurt een maand met één knop goed", async () => {
    render(
      <MonthlyPlanningApprovalBoard
        months={[
          {
            monthKey: "2026-09",
            monthLabel: "september 2026",
            totalHours: 38,
            reviewState: "DRAFT",
            roles: [
              { label: "Praktijkmanagement", hours: 16, detailCount: 4 },
              { label: "Fysiotherapeuten", hours: 8, detailCount: 2 },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText("Praktijkmanagement")).toBeInTheDocument();
    expect(screen.getByText("16 uur")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /september 2026 goedkeuren/i }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/planning/months/2026-09", { method: "PATCH" }),
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("toont bij een lege serverfout de goedkeuringsfout zonder te verversen", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => { throw new SyntaxError("geen JSON"); },
    } as unknown as Response);
    render(
      <MonthlyPlanningApprovalBoard
        months={[{
          monthKey: "2026-09",
          monthLabel: "september 2026",
          totalHours: 8,
          reviewState: "DRAFT",
          roles: [{ label: "Praktijkmanagement", hours: 8, detailCount: 1 }],
        }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /september 2026 goedkeuren/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Planmaand goedkeuren mislukt.");
    expect(screen.queryByText(/verbindingsfout/i)).not.toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("behandelt ook een onleesbare 2xx-respons fail-closed", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => { throw new SyntaxError("geen JSON"); },
    } as unknown as Response);
    render(
      <MonthlyPlanningApprovalBoard
        months={[{
          monthKey: "2026-09",
          monthLabel: "september 2026",
          totalHours: 8,
          reviewState: "DRAFT",
          roles: [{ label: "Praktijkmanagement", hours: 8, detailCount: 1 }],
        }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /september 2026 goedkeuren/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Planmaand goedkeuren mislukt.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("laat een goedgekeurde maand met een concrete reden auditbaar heropenen", async () => {
    render(
      <MonthlyPlanningApprovalBoard
        months={[{
          monthKey: "2026-08",
          monthLabel: "augustus 2026",
          totalHours: 26,
          reviewState: "REVIEWED",
          roles: [{ label: "Praktijkmanagement", hours: 13, detailCount: 4 }],
        }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /augustus 2026 corrigeren/i }));
    fireEvent.change(screen.getByLabelText(/reden voor correctie augustus 2026/i), {
      target: { value: "Verdeling over personen en werkzaamheden corrigeren." },
    });
    fireEvent.click(screen.getByRole("button", { name: /augustus 2026 heropenen/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/planning/months/2026-08/reopen",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ reason: "Verdeling over personen en werkzaamheden corrigeren." }),
      }),
    ));
    expect(refresh).toHaveBeenCalledOnce();
  });
});
