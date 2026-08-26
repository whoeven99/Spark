import { describe, expect, it } from "vitest";
import { buildMonitorDetailInput } from "../../../app/lib/healthMonitorAiDetail";
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
