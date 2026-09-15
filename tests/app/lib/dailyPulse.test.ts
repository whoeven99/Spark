import { describe, expect, it } from "vitest";
import {
  buildDailyPulse,
  formatDailyPulseHeadline,
  type DailyPulse,
  type DailyPulseSource,
} from "../../../app/lib/dailyPulse";

const LABELS: Record<string, string> = {
  "workspace.home.pulse.ok": "昨天经营正常",
  "workspace.home.pulse.syncing": "正在同步近 30 天订单",
  "workspace.home.pulse.noData": "还没有订单数据",
  "workspace.home.pulse.attention": "有 {{count}} 件该处理：{{reasons}}",
  "workspace.home.pulse.attentionPlain": "有 {{count}} 件该处理",
};

function t(key: string, options?: Record<string, unknown>): string {
  const template = LABELS[key] ?? key;
  return template
    .replace("{{count}}", String(options?.count ?? ""))
    .replace("{{reasons}}", String(options?.reasons ?? ""));
}

function source(overrides?: Partial<DailyPulseSource>): DailyPulseSource {
  return {
    hasData: true,
    snapshotDate: "2026-09-14",
    items: [],
    tasks: [],
    ...overrides,
  };
}

describe("buildDailyPulse", () => {
  it("returns ok when snapshot has data and nothing flagged", () => {
    expect(buildDailyPulse(source())).toEqual({
      status: "ok",
      snapshotDate: "2026-09-14",
      openTaskCount: 0,
      reasons: [],
    });
  });

  it("prefers open task titles for attention reasons", () => {
    expect(
      buildDailyPulse(
        source({
          items: [{ name: "退款率偏高", status: "risk" }],
          tasks: [
            { title: "处理超时单", status: "open", quadrant: "q1" },
            { title: "补货低库存", status: "open", quadrant: "q2" },
            { title: "已完成", status: "done", quadrant: "q1" },
          ],
        }),
      ),
    ).toEqual({
      status: "attention",
      snapshotDate: "2026-09-14",
      openTaskCount: 2,
      reasons: ["处理超时单", "补货低库存"],
    });
  });

  it("falls back to flagged item names when there are no open tasks", () => {
    expect(
      buildDailyPulse(
        source({
          items: [
            { name: "退款率偏高", status: "risk" },
            { name: "转化偏低", status: "watch" },
            { name: "正常", status: "healthy" },
          ],
        }),
      ),
    ).toMatchObject({
      status: "attention",
      openTaskCount: 2,
      reasons: ["退款率偏高", "转化偏低"],
    });
  });

  it("returns syncing only while install backfill is running", () => {
    expect(buildDailyPulse(null, { backfillRunning: true })).toEqual({
      status: "syncing",
      snapshotDate: null,
      openTaskCount: 0,
      reasons: [],
    });
  });

  it("returns no_data when there is no snapshot and no backfill", () => {
    expect(buildDailyPulse(null)).toEqual({
      status: "no_data",
      snapshotDate: null,
      openTaskCount: 0,
      reasons: [],
    });
    expect(buildDailyPulse(source({ hasData: false }))).toMatchObject({
      status: "no_data",
    });
  });
});

describe("formatDailyPulseHeadline", () => {
  const pulse = (status: DailyPulse["status"], extra?: Partial<DailyPulse>): DailyPulse => ({
    status,
    snapshotDate: "2026-09-14",
    openTaskCount: 0,
    reasons: [],
    ...extra,
  });

  it("formats each status without inventing an action", () => {
    expect(formatDailyPulseHeadline(pulse("ok"), t, "、")).toBe("昨天经营正常");
    expect(formatDailyPulseHeadline(pulse("syncing"), t, "、")).toBe(
      "正在同步近 30 天订单",
    );
    expect(formatDailyPulseHeadline(pulse("no_data"), t, "、")).toBe(
      "还没有订单数据",
    );
    expect(
      formatDailyPulseHeadline(
        pulse("attention", { openTaskCount: 2, reasons: ["超时单", "低库存"] }),
        t,
        "、",
      ),
    ).toBe("有 2 件该处理：超时单、低库存");
    expect(
      formatDailyPulseHeadline(pulse("attention", { openTaskCount: 3 }), t, "、"),
    ).toBe("有 3 件该处理");
  });
});
