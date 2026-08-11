// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ForecastEntryForm from "@/components/ForecastEntryForm";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

describe("ForecastEntryForm", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.unstubAllGlobals();
  });

  it("reset het vastgelegde formulier en ververst na een succesvolle opslag", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: "forecast-1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ForecastEntryForm
        allocationId="allocation-1"
        defaultDate="2026-09-10"
        defaultExecutor="Testuitvoerder"
      />,
    );

    fireEvent.change(screen.getByLabelText("Uren"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Toelichting"), {
      target: { value: "Voorbereiding implementatie" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Toevoegen" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/planning/forecast",
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.getByLabelText("Datum")).toHaveValue("2026-09-10");
    expect(screen.getByLabelText("Uitvoerder")).toHaveValue("Testuitvoerder");
    expect(screen.getByLabelText("Uren")).toHaveValue(null);
    expect(screen.getByLabelText("Toelichting")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Toevoegen" })).toBeEnabled();
  });

  it("herstelt de knop en kondigt een netwerkfout aan", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    render(
      <ForecastEntryForm
        allocationId="allocation-1"
        defaultDate="2026-09-10"
        defaultExecutor="Testuitvoerder"
      />,
    );

    fireEvent.change(screen.getByLabelText("Uren"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Toevoegen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Forecast opslaan mislukt door een netwerkfout.",
    );
    expect(screen.getByRole("button", { name: "Toevoegen" })).toBeEnabled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
