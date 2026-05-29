import { afterEach, describe, expect, it } from "vitest";
import {
  resolveOpsEmailDestination,
  resolveOpsNotifyEmail,
} from "../../../../app/server/email/opsNotifyEmail.server";

describe("resolveOpsEmailDestination", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("uses session owner email when present", () => {
    delete process.env.OPS_NOTIFY_EMAIL;
    const to = resolveOpsEmailDestination({
      email: "1287127238@qq.com",
    });
    expect(to).toBe("1287127238@qq.com");
  });

  it("falls back to ops notify when session email missing", () => {
    process.env.OPS_NOTIFY_EMAIL = "ops@example.com";
    const to = resolveOpsEmailDestination({
      firstName: "Aviva",
      email: "",
    });
    expect(to).toBe("ops@example.com");
  });
});

describe("resolveOpsNotifyEmail", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("prefers OPS_NOTIFY_EMAIL", () => {
    process.env.OPS_NOTIFY_EMAIL = "ops@example.com";
    expect(resolveOpsNotifyEmail()).toBe("ops@example.com");
  });
});
