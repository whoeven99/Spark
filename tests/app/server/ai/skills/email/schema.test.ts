import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { sendTemplateEmailToolSchema } from "../../../../../../app/server/ai/skills/email/email.schema";

describe("sendTemplateEmailToolSchema", () => {
  it("accepts valid input with allowed scenario", () => {
    const parsed = sendTemplateEmailToolSchema.parse({
      subject: "Translation complete",
      scenario: "task_completed",
      templateData: { user: "Test" },
    });
    expect(parsed.scenario).toBe("task_completed");
    expect(parsed.templateData).toEqual({ user: "Test" });
  });

  it("rejects unknown scenario", () => {
    expect(() =>
      sendTemplateEmailToolSchema.parse({
        subject: "Test",
        scenario: "first_install",
      }),
    ).toThrow(ZodError);
  });

  it("requires subject", () => {
    expect(() =>
      sendTemplateEmailToolSchema.parse({
        subject: "",
        scenario: "app_install_success",
      }),
    ).toThrow(ZodError);
  });
});
