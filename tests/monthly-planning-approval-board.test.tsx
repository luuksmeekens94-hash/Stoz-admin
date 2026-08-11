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
});
