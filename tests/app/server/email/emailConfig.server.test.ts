import { describe, expect, it } from "vitest";
import { resolveTencentSesFromEmail } from "../../../../app/server/email/config/emailConfig.server";
import { TENCENT_FROM_EMAIL } from "../../../../app/server/email/templates/emailTemplates.server";

describe("resolveTencentSesFromEmail", () => {
  it("defaults to msg subdomain From", () => {
    expect(resolveTencentSesFromEmail()).toBe(TENCENT_FROM_EMAIL);
    expect(resolveTencentSesFromEmail("")).toBe(TENCENT_FROM_EMAIL);
  });

  it("rejects merchant support inbox as SES From", () => {
    expect(resolveTencentSesFromEmail("support@ciwi.ai")).toBe(TENCENT_FROM_EMAIL);
    expect(resolveTencentSesFromEmail("  Support@ciwi.ai  ")).toBe(TENCENT_FROM_EMAIL);
  });

  it("allows other configured From addresses", () => {
    expect(resolveTencentSesFromEmail("noreply@msg.ciwi.ai")).toBe("noreply@msg.ciwi.ai");
  });
});
