import { describe, expect, it } from "vitest";
import {
  CONFIRMED_PROGRESS_FACTS,
  buildCorrectiveActionPlan,
  assessWorkPackageProgress,
} from "@/lib/project-progress";

describe("project progress facts", () => {
  it("houdt gereed, getest en gebruikt strikt uit elkaar", () => {
    expect(CONFIRMED_PROGRESS_FACTS.careContentVersions).toMatchObject({
      total: 12,
      contentReady: 12,
      published: 12,
      tested: 0,
      usedCount: null,
    });
    expect(CONFIRMED_PROGRESS_FACTS.processVideos).toMatchObject({
      total: 3,
      completed: 3,
      used: false,
    });
    expect(CONFIRMED_PROGRESS_FACTS.clientUse.firstUseMonth).toBe("2026-08");
    expect(CONFIRMED_PROGRESS_FACTS.clientUse.clientCount).toBeNull();
  });

  it("markeert WP2 als vertraagd, WP4 als nog niet verschuldigd en WP5/WP6 als aandachtspunt op live cutoff-uren", () => {
    const rows = assessWorkPackageProgress("2026-08-09", {
      WP1: 7.5,
      WP2: 12,
      WP3: 3,
      WP4: 0,
      WP5: 0,
      WP6: 0,
    });
    const byCode = new Map(rows.map((row) => [row.code, row]));

    expect(byCode.get("WP1")?.reportableHours).toBe(7.5);
    expect(byCode.get("WP1")?.knownEvidence).toContain("7,5");
    expect(byCode.get("WP2")?.status).toBe("DELAYED");
    expect(byCode.get("WP4")?.status).toBe("NOT_DUE");
    expect(byCode.get("WP5")?.status).toBe("BEHIND");
    expect(byCode.get("WP6")?.status).toBe("BEHIND");
    expect(byCode.get("WP6")?.knownEvidence).toContain("geen bevestigde");
  });

  it("maakt een corrigerend plan dat implementatie vóór impactmeting zet", () => {
    const actions = buildCorrectiveActionPlan();
    const pilot = actions.find((row) => row.id === "pilot-meijhorst");
    const monitoring = actions.find((row) => row.id === "monitoring-baseline");
    const impact = actions.find((row) => row.id === "follow-up-impact");

    expect(actions[0].periodStart).toBe("2026-08-01");
    expect(pilot?.workPackageCodes).toContain("WP4");
    expect(monitoring?.dependsOn).toContain("pilot-meijhorst");
    expect(impact?.dependsOn).toContain("monitoring-baseline");
    expect(actions.some((row) => row.claimsImpact)).toBe(false);
    expect(actions.at(-1)?.periodEnd).toBe("2027-08-31");
  });
});
