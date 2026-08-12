// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ReviewedPlanningHours from "@/components/ReviewedPlanningHours";

const rows = [
  {
    id: "forecast-1",
    plannedDate: "2026-08-10",
    executorName: "Luuk Smeekens",
    plannedHours: 3,
    note: "Indicatoren en inrichting van de gebruiksmonitoring.",
    workPackageCode: "WP6",
    activityCode: "A6.1",
    activityName: "Monitoring",
    monthLabel: "augustus 2026",
  },
];

describe("ReviewedPlanningHours", () => {
  it("toont goedgekeurde forecastregels afzonderlijk als gepland en niet als realisatie", () => {
    render(<ReviewedPlanningHours rows={rows} />);

    expect(screen.getByRole("heading", { name: /goedgekeurde planning/i })).toBeInTheDocument();
    expect(screen.getByText("Luuk Smeekens")).toBeInTheDocument();
    expect(screen.getByText("WP6/A6.1 · Monitoring")).toBeInTheDocument();
    expect(screen.getByText("3 uur")).toBeInTheDocument();
    expect(screen.getByText("Gepland")).toBeInTheDocument();
    expect(screen.getByText(/telt niet mee als werkelijk gewerkt/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /na uitvoering registreren/i })).toHaveAttribute(
      "href",
      "/uren/nieuw?forecastEntryId=forecast-1",
    );
  });

  it("kan de goedgekeurde planning inklappen zonder urenregels te wijzigen", () => {
    render(<ReviewedPlanningHours rows={rows} />);
    fireEvent.click(screen.getByRole("button", { name: /goedgekeurde planning inklappen/i }));
    expect(screen.queryByText("Luuk Smeekens")).not.toBeInTheDocument();
  });
});
