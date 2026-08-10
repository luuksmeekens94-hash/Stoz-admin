import { describe, expect, it } from "vitest";
import { neutralizeSpreadsheetCell, sanitizeCsvRows } from "@/lib/csv-export";

describe("CSV export safety", () => {
  it.each(["=SUM(A1:A2)", "+cmd", "-2+3", "@formula", "\t=cmd", "\r=cmd"])(
    "neutraliseert formuleleidende cellen: %s",
    (value) => {
      expect(neutralizeSpreadsheetCell(value)).toBe(`'${value}`);
    },
  );

  it("laat gewone tekst en getallen intact en saneert alle rijvelden", () => {
    expect(neutralizeSpreadsheetCell("Normale tekst")).toBe("Normale tekst");
    expect(neutralizeSpreadsheetCell(12.5)).toBe(12.5);
    expect(sanitizeCsvRows([{ Naam: "=cmd", Uren: 12.5 }])).toEqual([
      { Naam: "'=cmd", Uren: 12.5 },
    ]);
  });
});
