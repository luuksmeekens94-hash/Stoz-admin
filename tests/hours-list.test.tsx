// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HoursList from "@/components/HoursList";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const reconstructionEntry = {
  id: "hour-reconstruction-1",
  date: "2026-06-18T00:00:00.000Z",
  hours: 2,
  description: "Technische instructie werkelijk uitgevoerd en later gereconstrueerd.",
  status: "DRAFT",
  createdAt: "2026-08-10T10:00:00.000Z",
  user: { id: "user-1", name: "Uitvoerder Test" },
  workPackage: { code: "WP2", name: "Ontwikkeling" },
  activity: { code: "A2.1", name: "Techniek" },
  therapist: null,
  isHistoricalReconstruction: true,
  reconstructionReview: {
    integrity: "VALID" as const,
    asOf: "2026-08-10",
    confirmedTargetHours: 18,
    sourceType: "PROJECT_OWNER_RECONSTRUCTION",
    sourceReference: "Projectlogboek referentie HB-WP2-2026-06 met versie en vindplaats.",
    performedConfirmation: true,
    auditHistory: [
      {
        action: "CREATED_HISTORICAL_RECONSTRUCTION",
        reason: "Projectlogboek referentie HB-WP2-2026-06 met versie en vindplaats.",
        actor: "Beheerder Test",
        createdAt: "2026-08-10T10:00:00.000Z",
      },
    ],
  },
};
const ordinaryEntry = {
  ...reconstructionEntry,
  id: "hour-ordinary-1",
  isHistoricalReconstruction: false,
  reconstructionReview: null,
};

describe("HoursList historische reconstructies", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    refresh.mockReset();
  });

  it("biedt de eigenaar geen generieke wijzig-, indien- of deletebypass", () => {
    render(
      <HoursList
        entries={[reconstructionEntry]}
        isAdmin={false}
        currentUserId="user-1"
      />,
    );

    expect(screen.getByText("Historische reconstructie")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /selecteer historische reconstructie/i }),
    ).toBeDisabled();
    expect(screen.queryByRole("button", { name: /wijzigen/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /indienen/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /verwijderen/i })).not.toBeInTheDocument();
    expect(screen.getByText(/beheerder beheert/i)).toBeInTheDocument();
  });

  it("toont een serverconflict aan de beheerder en refresht niet alsof indienen gelukt is", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "De doelstand is inmiddels overschreden." }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
    );

    render(
      <HoursList
        entries={[reconstructionEntry]}
        isAdmin
        currentUserId="admin-1"
      />,
    );

    expect(screen.queryByRole("button", { name: /wijzigen/i })).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /indienen historische reconstructie/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "De doelstand is inmiddels overschreden.",
    );
    await waitFor(() => expect(refresh).not.toHaveBeenCalled());
  });

  it("wist een bulkselectie niet wanneer de bulkroute faalt", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Controleer de reconstructieprovenance." }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
    );

    render(
      <HoursList
        entries={[ordinaryEntry]}
        isAdmin
        currentUserId="admin-1"
      />,
    );

    const checkbox = screen.getByRole("checkbox", {
      name: /selecteer urenregel/i,
    });
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: /^indienen geselecteerde/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Controleer de reconstructieprovenance.",
    );
    expect(checkbox).toBeChecked();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("sluit reconstructies uit van generieke bulkacties en toont reviewbewijs", () => {
    render(
      <HoursList
        entries={[reconstructionEntry]}
        isAdmin
        currentUserId="admin-1"
      />,
    );

    expect(
      screen.getByRole("checkbox", { name: /selecteer historische reconstructie/i }),
    ).toBeDisabled();
    fireEvent.click(screen.getByText(/bron en audittrail beoordelen/i));
    expect(screen.getByText(/verklaring projecteigenaar/i)).toBeInTheDocument();
    expect(screen.getByText(/zwakke bron/i)).toBeInTheDocument();
    expect(screen.getByText(/HB-WP2-2026-06/i)).toBeInTheDocument();
    expect(screen.getByText(/CREATED_HISTORICAL_RECONSTRUCTION/i)).toBeInTheDocument();
  });

  it("vraagt expliciete bevestiging vóór reconstructiegoedkeuring", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    render(
      <HoursList
        entries={[{ ...reconstructionEntry, status: "SUBMITTED" }]}
        isAdmin
        currentUserId="admin-1"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /reconstructie beoordelen en goedkeuren/i }),
    );
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/brononderbouwing/i));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
  });

  it("biedt een beheerder een expliciet herstelpad voor een goedgekeurde reconstructie", () => {
    render(
      <HoursList
        entries={[{ ...reconstructionEntry, status: "APPROVED" }]}
        isAdmin
        currentUserId="admin-1"
      />,
    );

    expect(
      screen.getByRole("button", { name: /terugzetten.*herstel/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /correctie/i })).not.toBeInTheDocument();
  });
});
