import { describe, expect, it } from "vitest";
import {
  formatOpsNotifyPrice,
  formatOpsNotifyTime,
} from "../../../../app/server/feishu/feishuMessageFormat.server";

describe("formatOpsNotifyTime", () => {
  it("formats as YYYY-MM-DD HH:mm in Asia/Shanghai", () => {
    const formatted = formatOpsNotifyTime(
      new Date("2026-05-22T07:13:00.257Z"),
    );
    expect(formatted).toBe("2026-05-22 15:13");
  });
});

describe("formatOpsNotifyPrice", () => {
  it("wraps amount and currency in brackets", () => {
    expect(formatOpsNotifyPrice("9.99", "USD")).toBe("【9.99 USD】");
    expect(formatOpsNotifyPrice("79.99", "USD")).toBe("【79.99 USD】");
  });
});
