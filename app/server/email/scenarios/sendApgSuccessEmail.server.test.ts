import { describe, expect, it, vi } from "vitest";
import { EMAIL_TEMPLATE_IDS } from "../templates/emailTemplates.server";
import { sendApgSuccessEmail } from "./sendApgSuccessEmail.server";

describe("sendApgSuccessEmail", () => {
  it("builds templateData aligned with Java APG success email", async () => {
    const send = vi.fn().mockResolvedValue({
      ok: true,
      requestId: "r1",
      provider: "mock",
    });

    await sendApgSuccessEmail(
      {
        to: "shop@example.com",
        taskType: "product",
        username: "Alice",
        productCount: 1,
        durationSeconds: 12,
        creditUsed: 100,
        creditRemaining: 900,
      },
      {
        provider: { name: "mock", send },
        config: {
          enabled: true,
          provider: "tencent",
          tencent: {
            secretId: "x",
            secretKey: "y",
            region: "ap-hongkong",
            fromEmail: "support@msg.ciwi.ai",
            cc: [],
          },
          sendTimeoutMs: 1000,
          maxRetries: 1,
        },
      },
    );

    expect(send).toHaveBeenCalledOnce();
    const req = send.mock.calls[0]?.[0] as {
      templateId: number;
      templateData: Record<string, string>;
    };
    expect(req.templateId).toBe(EMAIL_TEMPLATE_IDS.APG_GENERATE_SUCCESS);
    expect(req.templateData).toMatchObject({
      task_type: "product",
      username: "Alice",
      product_count: "1",
      duration: "12",
      credit_used: "100",
      credit_remaining: "900",
    });
  });
});
