import { DynamicStructuredTool } from "@langchain/core/tools";
import { isEmailSendReady, loadEmailConfig } from "../../../email/config/emailConfig.server";
import { sendTemplateEmail } from "../../../email/services/emailService.server";
import type { ToolDefinition } from "../../core/toolRegistry.server";
import {
  AGENT_EMAIL_ERROR_CODES,
  SEND_TEMPLATE_EMAIL_LOG_PREFIX,
  SEND_TEMPLATE_EMAIL_TOOL_NAME,
} from "./constants";
import { sendTemplateEmailToolSchema } from "./schema";

function formatToolResult(result: Awaited<ReturnType<typeof sendTemplateEmail>>): string {
  if (result.ok) {
    return JSON.stringify({
      ok: true,
      requestId: result.requestId,
    });
  }
  return JSON.stringify({
    ok: false,
    code: result.error.code,
    message: result.error.message,
  });
}

export function createSendTemplateEmailTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: SEND_TEMPLATE_EMAIL_TOOL_NAME,
    description:
      "Send a Tencent SES template email to a specified recipient. Use only when the user explicitly asks to send an email and you have confirmed the recipient address, subject, and template scenario.",
    schema: sendTemplateEmailToolSchema,
    func: async (input) => {
      const requestId = crypto.randomUUID();
      const parsed = sendTemplateEmailToolSchema.safeParse(input);
      if (!parsed.success) {
        const message = parsed.error.issues.map((i) => i.message).join("；");
        console.warn(
          `${SEND_TEMPLATE_EMAIL_LOG_PREFIX} validation failed requestId=${requestId} message=${message}`,
        );
        return JSON.stringify({
          ok: false,
          code: AGENT_EMAIL_ERROR_CODES.INVALID_TEMPLATE_ID,
          message,
        });
      }

      const { to, subject, templateId, templateData } = parsed.data;
      console.info(
        `${SEND_TEMPLATE_EMAIL_LOG_PREFIX} start requestId=${requestId} templateId=${templateId} to=${to}`,
      );

      const result = await sendTemplateEmail({
        to,
        subject,
        templateId,
        templateData: templateData ?? {},
      });

      console.info(
        `${SEND_TEMPLATE_EMAIL_LOG_PREFIX} done requestId=${requestId} ok=${String(result.ok)}`,
      );
      return formatToolResult(result);
    },
  });
}

export const sendTemplateEmailToolDefinition: ToolDefinition = {
  name: "sendTemplateEmail",
  description: "向指定收件人发送腾讯 SES 模板邮件",
  condition: () => isEmailSendReady(loadEmailConfig()),
  systemPromptExtension:
    "仅当用户明确要求发送邮件、且对话中已确认收件人邮箱、邮件主题与模板场景（templateId）时，才调用工具 send_template_email。若缺少收件人或模板信息，先向用户追问，禁止编造「已发送成功」。工具返回 JSON：成功为 { ok: true, requestId }，失败为 { ok: false, code, message }，请据实告知用户。禁止通过工具修改发件人或抄送（from/cc 由系统配置）。",
  createTool: () => createSendTemplateEmailTool(),
};
