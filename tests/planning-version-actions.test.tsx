// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PlanningVersionActions from "@/components/PlanningVersionActions";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

describe("PlanningVersionActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("herijkt uitsluitend toekomstige conceptmaanden met een zichtbare auditreden", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ idempotent: false, reviewedMonthsPreserved: ["2026-08"] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PlanningVersionActions hasVersion hasFutureRebalance={false} />);

    expect(screen.getByText(/goedgekeurde maanden blijven ongewijzigd/i)).toBeInTheDocument();
    const reason = screen.getByLabelText(/reden voor herijking/i);
    expect((reason as HTMLTextAreaElement).value).toMatch(/actuele projectfase/i);
    fireEvent.click(screen.getByRole("button", { name: /toekomstige conceptmaanden herijken/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/planning/rebalance", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ reason: (reason as HTMLTextAreaElement).value }),
    })));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("handelt onleesbare en niet-succesvolle antwoorden fail-closed af", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => { throw new Error("broken"); },
    }));
    render(<PlanningVersionActions hasVersion hasFutureRebalance={false} />);

    fireEvent.click(screen.getByRole("button", { name: /toekomstige conceptmaanden herijken/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/herijken mislukt/i);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("toont een blijvende gereedstatus nadat de herijking auditbaar is vastgelegd", () => {
    render(<PlanningVersionActions hasVersion hasFutureRebalance />);
    expect(screen.getByText(/toekomstplanning is herijkt/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /toekomstige conceptmaanden herijken/i })).not.toBeInTheDocument();
  });
});
