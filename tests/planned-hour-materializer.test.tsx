// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PlannedHourMaterializer from "@/components/PlannedHourMaterializer";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh, back: vi.fn() }) }));

const planning = {
  id: "forecast-1",
  plannedDate: "2026-08-10",
  executorName: "Luuk Smeekens",
  plannedHours: 3,
  note: "Indicatoren en inrichting van de gebruiksmonitoring.",
  workPackageCode: "WP6",
  activityCode: "A6.1",
  activityName: "Monitoring",
  suggestedActorKey: "user:luuk",
};
const actors = [
  { key: "user:luuk", userId: "luuk", therapistId: null, name: "Luuk Smeekens", roleLabel: "Extern adviseur" },
  { key: "user:heidi", userId: "heidi", therapistId: null, name: "Heidi", roleLabel: "Praktijkmanagement" },
];

describe("PlannedHourMaterializer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    push.mockReset();
    refresh.mockReset();
  });

  it("vult planwaarden en de exact herkende persoon vooraf in maar laat bewijs en bevestiging open", () => {
    render(<PlannedHourMaterializer planning={planning} actors={actors} today="2026-08-12" />);

    expect(screen.getByLabelText(/werkelijke uitvoerder/i)).toHaveValue("user:luuk");
    expect(screen.getByLabelText(/werkelijke uitvoeringsdatum/i)).toHaveValue("2026-08-10");
    expect(screen.getByLabelText(/werkelijke uren/i)).toHaveValue(3);
    expect(screen.getByLabelText(/^werkzaamheden$/i)).toHaveValue(planning.note);
    expect(screen.getByLabelText(/bron of onderbouwing/i)).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: /daadwerkelijk/i })).not.toBeChecked();
    expect(screen.getByRole("button", { name: /conceptregistratie aanmaken/i })).toBeDisabled();
    expect(screen.getByText(/telt nog niet mee als werkelijk gewerkt/i)).toBeInTheDocument();
  });

  it("verstuurd gecorrigeerde feitelijke waarden naar de specifieke planningroute", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "hour-1", status: "DRAFT" }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<PlannedHourMaterializer planning={planning} actors={actors} today="2026-08-12" />);

    fireEvent.change(screen.getByLabelText(/werkelijke uitvoerder/i), { target: { value: "user:heidi" } });
    fireEvent.change(screen.getByLabelText(/werkelijke uren/i), { target: { value: "2.75" } });
    fireEvent.change(screen.getByLabelText(/bron of onderbouwing/i), { target: { value: "Agenda en opgeleverde monitoringsnotitie van 10 augustus 2026." } });
    fireEvent.click(screen.getByRole("checkbox", { name: /daadwerkelijk/i }));
    fireEvent.click(screen.getByRole("button", { name: /conceptregistratie aanmaken/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith("/api/hours/planning/forecast-1/entries", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      userId: "heidi",
      therapistId: null,
      date: "2026-08-10",
      hours: 2.75,
      performedConfirmation: true,
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/uren"));
  });

  it("blokkeert een toekomstige planregel in de UI", () => {
    render(<PlannedHourMaterializer planning={{ ...planning, plannedDate: "2026-08-13" }} actors={actors} today="2026-08-12" />);
    expect(screen.getByRole("alert")).toHaveTextContent(/pas na uitvoering/i);
    expect(screen.getByRole("button", { name: /conceptregistratie aanmaken/i })).toBeDisabled();
  });
});
