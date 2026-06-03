import { DynamicStructuredTool } from "@langchain/core/tools";
import { isEmailSendReady, loadEmailConfig } from "../../../email/config/emailConfig.server";
import { sendTemplateEmail } from "../../../email/services/emailService.server";
import type { AgentContext, ToolDefinition } from "../../core/toolRegistry.server";
import {
  AGENT_EMAIL_ERROR_CODES,
  buildEmailScenarioCatalog,
  resolveTemplateIdByScenario,
  SEND_TEMPLATE_EMAIL_LOG_PREFIX,
  SEND_TEMPLATE_EMAIL_TOOL_NAME,
} from "./constants";
import {
  enrichAgentTemplateData,
  loadShopBasicInfoSafe,
  resolveMerchantEmail,
} from "./enrichAgentTemplateData.server";
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

export function createSendTemplateEmailTool(context: AgentContext): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: SEND_TEMPLATE_EMAIL_TOOL_NAME,
    description: `Send a Tencent SES template email to a specified recipient. Use only when the user explicitly asks to send an email and you have confirmed the recipient address, subject, and scenario. Available scenarios: ${buildEmailScenarioCatalog()}`,
    schema: sendTemplateEmailToolSchema,
    func: async (input) => {
      const requestId = crypto.randomUUID();
      const { subject, scenario, templateData } = input;
      const templateId = resolveTemplateIdByScenario(scenario);

      // 收件人由服务端按店铺解析，禁止 Agent 指定，避免越权/幻觉发往任意地址
      const shopInfo = await loadShopBasicInfoSafe(context);
      const to = resolveMerchantEmail(shopInfo);
      if (!to) {
        console.warn(
          `${SEND_TEMPLATE_EMAIL_LOG_PREFIX} no recipient requestId=${requestId} scenario=${scenario} shop=${context.shop ?? ""}`,
        );
        return JSON.stringify({
          ok: false,
          code: AGENT_EMAIL_ERROR_CODES.NO_RECIPIENT,
          message: "无法解析商家收件邮箱，邮件未发送",
        });
      }

      const agentKeyCount = Object.keys(templateData ?? {}).length;
      const enrichedTemplateData = await enrichAgentTemplateData(
        templateId,
        context,
        templateData,
        shopInfo,
      );
      const enrichedKeyCount = Object.keys(enrichedTemplateData).length;

      console.info(
        `${SEND_TEMPLATE_EMAIL_LOG_PREFIX} start requestId=${requestId} scenario=${scenario} templateId=${templateId} templateDataKeyCount=${agentKeyCount}->${enrichedKeyCount}`,
      );

      const result = await sendTemplateEmail({
        to,
        subject,
        templateId,
        templateData: enrichedTemplateData,
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
  displayName: "模板邮件发送",
  category: "通知",
  stage: "execute",
  description: "通过腾讯 SES 向指定收件人发送预设模板邮件",
  condition: () => isEmailSendReady(loadEmailConfig()),
  systemPromptExtension: `仅当用户明确要求发送邮件、且已确认邮件主题与场景（scenario）时，才调用工具 send_template_email。scenario 只能从以下枚举中选择，禁止猜测或传数字 ID：${buildEmailScenarioCatalog()}。收件人由系统按当前店铺自动解析为商家邮箱，你无需也无法指定收件人；若系统无法解析到邮箱会返回 { ok: false, code: "NO_RECIPIENT" }。若缺少场景信息，先向用户追问，禁止编造「已发送成功」。工具返回 JSON：成功为 { ok: true, requestId }，失败为 { ok: false, code, message }，请据实告知用户。禁止通过工具修改发件人或抄送（from/cc 由系统配置）。templateData 的通用字段（appName、brandName、shopName、shopDomain、occurredAtUtc 等）及安装/卸载时间字段由服务端自动补全；你只需补充该场景特有的业务字段（如 taskName、planName、orderId）。`,
  createTool: (context) => createSendTemplateEmailTool(context),
};
