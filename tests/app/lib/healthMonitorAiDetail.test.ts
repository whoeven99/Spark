import { describe, expect, it } from "vitest";
import { buildMonitorDetailInput, resolveHealthMonitorDetail } from "../../../app/lib/healthMonitorAiDetail";
import { HEALTH_MONITORS } from "../../../app/lib/healthMonitorData";

describe("inferCoreMetricLabel via buildMonitorDetailInput", () => {
  it("does not fall back to 毛利率 for payment, refund, or product readiness", () => {
    const labels = Object.fromEntries(
      HEALTH_MONITORS.map((monitor) => [monitor.id, buildMonitorDetailInput(monitor).coreMetric.label]),
    );

    expect(labels["payment-health"]).toBe("支付成功率");
    expect(labels["refund-health"]).toBe("退款率");
    expect(labels["product-readiness-health"]).toBe("商品就绪度");
    expect(labels["pricing-health"]).toBe("毛利率");
    expect(labels["risk-control-health"]).toBe("风控状态");
  });

  it("uses the monitor title when the id is unknown", () => {
    const input = buildMonitorDetailInput({
      ...HEALTH_MONITORS[0],
      id: "unknown-health",
      title: "未知健康项",
      value: "42%",
    });

    expect(input.coreMetric.label).toBe("未知健康项");
  });
});

describe("resolveHealthMonitorDetail evidence", () => {
  it("does not invent a second demo evidence row when only one real fact exists", () => {
    const template = HEALTH_MONITORS.find((item) => item.id === "conversion-health");
    if (!template) throw new Error("missing conversion-health template");

    const detail = resolveHealthMonitorDetail({
      ...template,
      value: "CVR 3.2%",
      evidence: [{ label: "当前数据", value: "近 7 天转化率 3.2%。" }],
    });

    expect(detail.result.evidenceSummary).toHaveLength(1);
    expect(detail.result.evidenceSummary[0]?.summary).toBe("近 7 天转化率 3.2%。");
    expect(detail.result.evidenceSummary.map((entry) => entry.summary).join(" ")).not.toContain("1.4%");
  });
});
