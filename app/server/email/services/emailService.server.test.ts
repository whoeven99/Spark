import { describe, expect, it, vi } from "vitest";
import { EMAIL_ERROR_CODES } from "../types/emailError";
import type { EmailProvider } from "../providers/emailProvider";
import { sendTemplateEmail } from "./emailService.server";

describe("sendTemplateEmail", () => {
  it("returns validation error for invalid email", async () => {
    const result = await sendTemplateEmail(
      {
        templateId: 144209,
        subject: "Test",
        to: "not-an-email",
        templateData: {},
      },
      {
        config: {
          enabled: true,
          provider: "tencent",
          tencent: {
            secretId: "id",
            secretKey: "key",
            region: "ap-hongkong",
            fromEmail: "support@msg.ciwi.ai",
            cc: ["feynman@ciwi.ai"],
          },
          sendTimeoutMs: 1000,
          maxRetries: 1,
        },
        provider: {
          name: "mock",
          send: vi.fn(),
        },
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(EMAIL_ERROR_CODES.VALIDATION_FAILED);
    }
  });

  it("delegates to mock provider on success", async () => {
    const mockProvider: EmailProvider = {
      name: "mock",
      send: vi.fn().mockResolvedValue({
        ok: true,
        requestId: "req-1",
        provider: "mock",
      }),
    };

    const result = await sendTemplateEmail(
      {
        templateId: 144209,
        subject: "Success",
        to: "user@example.com",
        templateData: { username: "Ada" },
      },
      {
        config: {
          enabled: true,
          provider: "tencent",
          tencent: {
            secretId: "id",
            secretKey: "key",
            region: "ap-hongkong",
            fromEmail: "support@msg.ciwi.ai",
            cc: [],
          },
          sendTimeoutMs: 1000,
          maxRetries: 1,
        },
        provider: mockProvider,
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.requestId).toBe("req-1");
    }
    expect(mockProvider.send).toHaveBeenCalledOnce();
  });

  it("returns missing credentials when tencent config absent", async () => {
    const result = await sendTemplateEmail(
      {
        templateId: 1,
        subject: "S",
        to: "a@b.com",
      },
      {
        config: {
          enabled: true,
          provider: "tencent",
          tencent: null,
          sendTimeoutMs: 1000,
          maxRetries: 1,
        },
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(EMAIL_ERROR_CODES.MISSING_CREDENTIALS);
    }
  });
});
