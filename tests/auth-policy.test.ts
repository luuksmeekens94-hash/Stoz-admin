import { describe, expect, it } from "vitest";
import { isSessionRecordUsable, resolveAppBaseUrl } from "@/lib/auth-policy";
import { hashAuthToken } from "@/lib/auth-token";

describe("auth policy", () => {
  it("weigert een niet-verlopen sessie zodra de gebruiker inactief is", () => {
    const now = new Date("2026-08-10T12:00:00.000Z");
    expect(isSessionRecordUsable({ expiresAt: new Date("2026-08-11T12:00:00.000Z"), userActive: false }, now)).toBe(false);
    expect(isSessionRecordUsable({ expiresAt: new Date("2026-08-11T12:00:00.000Z"), userActive: true }, now)).toBe(true);
  });

  it("slaat magic-linktokens uitsluitend als een vaste SHA-256-hash op", () => {
    const token = "test-token-dat-nooit-in-de-database-mag-staan";
    expect(hashAuthToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashAuthToken(token)).toBe(hashAuthToken(token));
    expect(hashAuthToken(token)).not.toContain(token);
  });

  it("gebruikt in productie uitsluitend de geconfigureerde publieke basis-URL", () => {
    expect(
      resolveAppBaseUrl({
        nodeEnv: "production",
        configuredBaseUrl: "https://stoz.example.nl/",
        requestUrl: "https://aanvaller.example/auth/login",
      }),
    ).toBe("https://stoz.example.nl");
  });

  it("blokkeert productie-loginlinks zonder APP_BASE_URL", () => {
    expect(() =>
      resolveAppBaseUrl({
        nodeEnv: "production",
        requestUrl: "https://aanvaller.example/auth/login",
      }),
    ).toThrow(/APP_BASE_URL/);
  });

  it("mag lokaal terugvallen op de origin van het verzoek", () => {
    expect(
      resolveAppBaseUrl({
        nodeEnv: "development",
        requestUrl: "http://localhost:3000/api/auth/login",
      }),
    ).toBe("http://localhost:3000");
  });
});
