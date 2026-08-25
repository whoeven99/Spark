import { describe, expect, it } from "vitest";
import {
  HIDDEN_HEALTH_MONITOR_IDS,
  buildHealthMonitorRecords,
  getHealthMonitorGroups,
} from "../../../app/lib/healthMonitorData";

describe("hidden health monitors", () => {
  it("does not render risk-control or combined ROI placeholders", () => {
    const records = buildHealthMonitorRecords();
    const ids = records.map((record) => record.id);

    expect(ids).not.toContain("risk-control-health");
    expect(ids).not.toContain("roi-health");
    expect(HIDDEN_HEALTH_MONITOR_IDS.size).toBe(2);
  });

  it("keeps groups free of hidden items after snapshot merge", () => {
    const records = buildHealthMonitorRecords({
      environments: [
        {
          key: "risk-control",
          status: "watch",
          source: "pending",
          summary: "should stay hidden",
          metrics: {},
        },
      ],
    });
    const ids = getHealthMonitorGroups()
      .flatMap((group) => group.items)
      .map((item) => item.id)
      .concat(records.map((record) => record.id));

    expect(ids).not.toContain("risk-control-health");
    expect(ids).not.toContain("roi-health");
  });
});
