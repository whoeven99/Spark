import { afterEach, describe, expect, it, vi } from "vitest";
import { buildOpsEmailSendPayload } from "../../../../../admin/server/lib/opsEmail/sendCampaign.js";
import {
  describeSesError,
  formatSesFailureMessage,
  redactOpsEmailParams,
} from "../../../../../admin/server/lib/opsEmail/sesSimple.js";

describe("opsEmail SES template send helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts Tencent SDK code and requestId from errors", () => {
    const error = Object.assign(new Error("操作失败。未开通自定义发送权限，必须使用模板发送。"), {
      code: "FailedOperation.NotSupportMailType",
      requestId: "req-123",
    });
    expect(describeSesError(error)).toEqual({
      message: "操作失败。未开通自定义发送权限，必须使用模板发送。",
      code: "FailedOperation.NotSupportMailType",
      requestId: "req-123",
    });
  });

  it("reads Code/Message/RequestId from API-shaped objects", () => {
    expect(
      describeSesError({
        Code: "FailedOperation.TemplateNotFound",
        Message: "模板不存在",
        RequestId: "req-456",
      }),
    ).toEqual({
      message: "模板不存在",
      code: "FailedOperation.TemplateNotFound",
      requestId: "req-456",
    });
  });

  it("formats failure text with SES code, requestId and send mode", () => {
    expect(
      formatSesFailureMessage(
        {
          message: "操作失败。未开通自定义发送权限，必须使用模板发送。",
          code: "FailedOperation.NotSupportMailType",
          requestId: "req-123",
        },
        { mode: "simple", templateId: 0 },
      ),
    ).toBe(
      "操作失败。未开通自定义发送权限，必须使用模板发送。 | code=FailedOperation.NotSupportMailType | requestId=req-123 | mode=simple",
    );
    expect(
      formatSesFailureMessage(
        { message: "模板变量缺失", code: "FailedOperation.InvalidTemplateData", requestId: null },
        { mode: "template", templateId: 184217 },
      ),
    ).toBe(
      "模板变量缺失 | code=FailedOperation.InvalidTemplateData | mode=template | templateId=184217",
    );
  });

  it("redacts email-like param values before logging", () => {
    expect(
      redactOpsEmailParams({
        supportEmail: "dao@ciwi.ai",
        shopName: "ciwishop",
      }),
    ).toEqual({
      supportEmail: "d***@ciwi.ai",
      shopName: "ciwishop",
    });
  });

  it("sends built-in catalog mail via Tencent template id, not local HTML", () => {
    const payload = buildOpsEmailSendPayload({
      templateKey: "appInstalled-en",
      subjectOverride: "🎉 Successfully installed! Start exploring now | {{appName}}",
      params: {
        appName: "Spark AI",
        shopName: "test",
        shop_id: "ciwishop",
      },
    });
    expect(payload.mode).toBe("template");
    expect(payload).toMatchObject({
      mode: "template",
      templateId: 184217,
      subject: "🎉 Successfully installed! Start exploring now | Spark AI",
    });
    if (payload.mode !== "template") throw new Error("expected template payload");
    expect(payload.templateData.appName).toBe("Spark AI");
    expect(payload.templateData.shop_id).toBe("ciwishop");
    expect(payload.templateData.path).toBe("app");
    expect(payload).not.toHaveProperty("html");
  });

  it("keeps custom HTML on the simple send path", () => {
    const payload = buildOpsEmailSendPayload({
      templateKey: "custom",
      subjectOverride: "Hello {{shopName}}",
      customHtml: "<p>{{shopName}}</p>",
      params: { shopName: "demo" },
    });
    expect(payload).toEqual({
      mode: "simple",
      templateId: 0,
      label: "自定义模板",
      subject: "Hello demo",
      html: "<p>demo</p>",
    });
  });
});
