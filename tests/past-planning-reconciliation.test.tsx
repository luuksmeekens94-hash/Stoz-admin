// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PastPlanningReconciliation from "@/components/PastPlanningReconciliation";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const rows = [
  {
    id: "forecast-1",
    plannedDate: "2026-08-10",
    executorName: "Luuk Smeekens",
    plannedHours: 3,
    note: "Monitoring en indicatoren ingericht.",
    workPackageCode: "WP6",
    activityCode: "A6.1",
    activityName: "Monitoring",
    monthKey: "2026-08",
    monthLabel: "augustus 2026",
    suggestedActorKey: "user:luuk",
  },
  {
    id: "forecast-2",
    plannedDate: "2026-08-17",
    executorName: "Front- en backoffice Fy-fit",
    plannedHours: 2,
    note: "Instructie en ondersteuning uitgevoerd.",
    workPackageCode: "WP3",
    activityCode: "A3.2",
    activityName: "Instructie tools",
    monthKey: "2026-08",
    monthLabel: "augustus 2026",
    suggestedActorKey: "",
  },
];
const actors = [
  { key: "user:luuk", userId: "luuk", therapistId: null, name: "Luuk Smeekens", roleLabel: "Extern adviseur" },
  { key: "user:backoffice", userId: "backoffice", therapistId: null, name: "Front- en backoffice Fy-fit", roleLabel: "Front/backoffice" },
];

describe("PastPlanningReconciliation", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ monthKey: "2026-08", approvedCount: 2, approvedHours: 5 }),
    }));
  });

  it("toont afgelopen planmaanden en keurt een volledige maand na expliciete bevestiging in één actie goed", async () => {
    render(<PastPlanningReconciliation rows={rows} actors={actors} />);

    expect(screen.getByRole("heading", { name: /augustus 2026/i })).toBeInTheDocument();
    expect(screen.getByText(/2 openstaande regels · 5 uur/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Luuk Smeekens — Extern adviseur")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/werkelijke uitvoerder.*front- en backoffice/i), {
      target: { value: "user:backoffice" },
    });
    fireEvent.change(screen.getByLabelText(/bron of onderbouwing augustus 2026/i), {
      target: { value: "Agenda en opgeleverde projectnotities voor augustus 2026 gecontroleerd." },
    });
    fireEvent.click(screen.getByLabelText(/alle geselecteerde werkzaamheden.*daadwerkelijk uitgevoerd/i));
    fireEvent.click(screen.getByRole("button", { name: /augustus 2026 registreren en goedkeuren/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/hours/planning/months/2026-08/reconcile",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          sourceReference: "Agenda en opgeleverde projectnotities voor augustus 2026 gecontroleerd.",
          performedConfirmation: true,
          rows: [
            { forecastEntryId: "forecast-1", userId: "luuk", therapistId: null },
            { forecastEntryId: "forecast-2", userId: "backoffice", therapistId: null },
          ],
        }),
      }),
    ));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("blijft fail-closed zolang uitvoerder, bron of uitvoeringsbevestiging ontbreekt", () => {
    render(<PastPlanningReconciliation rows={rows} actors={actors} />);
    expect(screen.getByRole("button", { name: /augustus 2026 registreren en goedkeuren/i })).toBeDisabled();
  });
});
