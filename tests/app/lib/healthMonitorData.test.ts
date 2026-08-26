import { describe, expect, it } from "vitest";
import {
  HIDDEN_HEALTH_MONITOR_IDS,
  buildHealthMonitorRecords,
  getHealthMonitorGroups,
  type HealthMonitorRecord,
} from "../../../app/lib/healthMonitorData";

function findMonitor(records: HealthMonitorRecord[], id: string) {
  const record = records.find((item) => item.id === id);
  if (!record) throw new Error(`missing monitor ${id}`);
  return record;
}

function evidenceText(record: HealthMonitorRecord) {
  return record.evidence.map((entry) => entry.value).join(" ");
}

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

describe("buildHealthMonitorRecords evidence", () => {
  it("does not pad sparse real conversion evidence with demo copy", () => {
    const conversion = findMonitor(
      buildHealthMonitorRecords({
        environments: [
          {
            key: "conversion",
            status: "watch",
            source: "real",
            summary: "近 7 天转化率 3.2%。",
            metrics: { conversionRate7d: 3.2 },
          },
        ],
      }),
      "conversion-health",
    );

    expect(conversion.value).toBe("CVR 3.2%");
    expect(conversion.evidence).toHaveLength(1);
    expect(conversion.evidence[0]?.value).toBe("近 7 天转化率 3.2%。");
    expect(evidenceText(conversion)).not.toContain("1.4%");
    expect(evidenceText(conversion)).not.toContain("1.9%");
  });

  it("does not keep the demo conversion card when the environment is missing", () => {
    const conversion = findMonitor(buildHealthMonitorRecords({ environments: [] }), "conversion-health");

    expect(conversion.value).toBe("暂无数据");
    expect(evidenceText(conversion)).not.toContain("1.4%");
    expect(evidenceText(conversion)).toContain("当前没有足够可核验证据，暂不补演示数字。");
  });

  it("keeps demo conversion copy only when the whole page is in fallback mode", () => {
    const conversion = findMonitor(buildHealthMonitorRecords(), "conversion-health");

    expect(conversion.value).toBe("CVR 1.4%");
    expect(evidenceText(conversion)).toContain("CVR 1.4%，低于近 30 天均值 1.9%。");
  });
});
