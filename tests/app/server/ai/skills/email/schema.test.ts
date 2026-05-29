import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { EMAIL_TEMPLATE_IDS } from "../../../../../../app/server/email/templates/emailTemplates.server";
import { AGENT_ALLOWED_TEMPLATE_IDS } from "../../../../../../app/server/ai/skills/email/constants";
import { sendTemplateEmailToolSchema } from "../../../../../../app/server/ai/skills/email/schema";

describe("sendTemplateEmailToolSchema", () => {
  it("accepts valid input with allowed templateId", () => {
    const templateId = AGENT_ALLOWED_TEMPLATE_IDS[0];
    const parsed = sendTemplateEmailToolSchema.parse({
      to: "merchant@example.com",
      subject: "Translation complete",
      templateId,
      templateData: { user: "Test" },
    });
    expect(parsed.to).toBe("merchant@example.com");
    expect(parsed.templateId).toBe(templateId);
    expect(parsed.templateData).toEqual({ user: "Test" });
  });

  it("rejects invalid email address", () => {
    expect(() =>
      sendTemplateEmailToolSchema.parse({
        to: "not-an-email",
        subject: "Hi",
        templateId: EMAIL_TEMPLATE_IDS.TRANSLATION_SUCCESS,
      }),
    ).toThrow(ZodError);
  });

  it("rejects FIRST_INSTALL templateId (ops-only)", () => {
    expect(() =>
      sendTemplateEmailToolSchema.parse({
        to: "ops@example.com",
        subject: "Install",
        templateId: EMAIL_TEMPLATE_IDS.FIRST_INSTALL,
      }),
    ).toThrow(ZodError);
  });

  it("rejects unknown templateId", () => {
    expect(() =>
      sendTemplateEmailToolSchema.parse({
        to: "user@example.com",
        subject: "Test",
        templateId: 999999,
      }),
    ).toThrow(ZodError);
  });

  it("requires subject and to", () => {
    expect(() =>
      sendTemplateEmailToolSchema.parse({
        to: "",
        subject: "",
        templateId: EMAIL_TEMPLATE_IDS.TRANSLATION_SUCCESS,
      }),
    ).toThrow(ZodError);
  });
});
