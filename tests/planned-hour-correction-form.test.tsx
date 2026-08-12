// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PlannedHourCorrectionForm from "@/components/PlannedHourCorrectionForm";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const props = {
  entry: {
    id: "planned-hour-1",
    date: "2026-08-10",
    hours: 2,
    description: "Implementatie werkelijk uitgevoerd.",
    actorKey: "user:user-1",
    workPackageCode: "WP4",
    activityCode: "A4.2",
    activityName: "Implementatie",
  },
  actors: [
    {
      key: "user:user-1",
      userId: "user-1",
      therapistId: null,
      name: "Luuk Smeekens",
      roleLabel: "Projectmanagement",
    },
  ],
  currentSourceReference: "Agenda en opgeleverde implementatienotitie van 10 augustus 2026.",
  today: "2026-08-12",
};

describe("PlannedHourCorrectionForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    push.mockReset();
    refresh.mockReset();
  });

  it("stuurt bron, correctiereden en herbevestiging naar de beschermde route", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "planned-hour-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    render(<PlannedHourCorrectionForm {...props} />);

    const save = screen.getByRole("button", { name: /Planninguur auditbaar corrigeren/i });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Nieuwe bron of onderbouwing/i), {
      target: { value: "Gecorrigeerde agenda en definitieve implementatienotitie van 10 augustus." },
    });
    fireEvent.change(screen.getByLabelText(/Reden van de correctie/i), {
      target: { value: "Werkelijke duur gecorrigeerd na controle van de agenda." },
    });
    fireEvent.click(screen.getByLabelText(/opnieuw dat deze gecorrigeerde werkzaamheden daadwerkelijk/i));
    fireEvent.click(save);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/hours/planning/entries/planned-hour-1",
      expect.objectContaining({ method: "PATCH" }),
    ));
    const request = vi.mocked(globalThis.fetch).mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      action: "correct",
      sourceReference: expect.stringMatching(/definitieve implementatienotitie/i),
      correctionReason: expect.stringMatching(/Werkelijke duur gecorrigeerd/i),
      performedConfirmation: true,
    });
    expect(push).toHaveBeenCalledWith("/uren");
  });

  it("blijft fail-closed bij een onleesbare foutresponse", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("geen-json", { status: 502 }));
    render(<PlannedHourCorrectionForm {...props} />);
    fireEvent.change(screen.getByLabelText(/Nieuwe bron of onderbouwing/i), {
      target: { value: "Gecorrigeerde agenda en definitieve implementatienotitie van 10 augustus." },
    });
    fireEvent.change(screen.getByLabelText(/Reden van de correctie/i), {
      target: { value: "Werkelijke duur gecorrigeerd na controle van de agenda." },
    });
    fireEvent.click(screen.getByLabelText(/opnieuw dat deze gecorrigeerde werkzaamheden daadwerkelijk/i));
    fireEvent.click(screen.getByRole("button", { name: /Planninguur auditbaar corrigeren/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/kon niet auditbaar worden gecorrigeerd/i);
    expect(push).not.toHaveBeenCalled();
  });
});
