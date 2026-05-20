import { afterEach, describe, expect, it, vi } from "vitest";
import { sendUninstallOpsEmail } from "../../../../../app/server/email/scenarios/sendUninstallOpsEmail.server";

describe("sendUninstallOpsEmail", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("skips when OPS_UNINSTALL_TEMPLATE_ID is not configured", async () => {
    delete process.env.OPS_UNINSTALL_TEMPLATE_ID;
    process.env.OPS_NOTIFY_EMAIL = "ops@example.com";

    const result = await sendUninstallOpsEmail({
      shop: "demo.myshopify.com",
      appName: "chat",
      uninstalledAt: new Date(),
    });

    expect(result).toMatchObject({ skipped: true, reason: "no_template_id" });
  });

  it("skips when no session email and no ops fallback", async () => {
    process.env.OPS_UNINSTALL_TEMPLATE_ID = "999001";
    delete process.env.OPS_NOTIFY_EMAIL;
    vi.stubEnv("TENCENT_CLOUD_KEY_ID", "");
    vi.stubEnv("TENCENT_CLOUD_KEY", "");

    const result = await sendUninstallOpsEmail(
      {
        shop: "demo.myshopify.com",
        appName: "chat",
        uninstalledAt: new Date(),
        sessionSnapshot: { shop: "demo.myshopify.com" },
      },
      {
        config: {
          enabled: true,
          provider: "tencent",
          tencent: null,
          sendTimeoutMs: 3000,
          maxRetries: 1,
        },
      },
    );

    expect(result).toMatchObject({ skipped: true, reason: "no_recipient" });
  });
});
