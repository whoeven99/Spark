import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentContext, ToolDefinition } from "../../core/toolRegistry.server";
import { loadBillingContext } from "../../../billing/billingContext.server";
import { logDetailedError } from "../../../productImprove/generateDescriptionLog.server";

export const GET_BILLING_STATUS_TOOL_NAME = "get_billing_status";
const LOG_PREFIX = "[GetBillingStatus]";

function createGetBillingStatusTool(context: AgentContext): DynamicStructuredTool {
  const { shop } = context;
  return new DynamicStructuredTool({
    name: GET_BILLING_STATUS_TOOL_NAME,
    description:
      "查询当前店铺的订阅套餐与 token 余额，包括可用 token 数、已用 token 数、当前套餐名称及到期时间。当用户询问账户余额、套餐状态、是否还有额度时使用。",
    schema: z.object({}),
    func: async () => {
      const requestId = crypto.randomUUID();
      console.info(`${LOG_PREFIX} start requestId=${requestId} shop=${shop ?? "unknown"}`);
      if (!shop) {
        return JSON.stringify({ ok: false, errorMsg: "无法识别当前店铺" });
      }
      try {
        const ctx = await loadBillingContext(shop, { grantTrial: false });
        console.info(
          `${LOG_PREFIX} done requestId=${requestId} availableTokens=${ctx.availableTokens} hasAccess=${ctx.hasAccess}`,
        );
        return JSON.stringify({
          ok: true,
          hasAccess: ctx.hasAccess,
          availableTokens: ctx.availableTokens,
          usedTokens: ctx.usedTokens,
          subscription: ctx.subscription
            ? {
                planKey: ctx.subscription.planKey,
                status: ctx.subscription.status,
                currentPeriodEnd: ctx.subscription.currentPeriodEnd?.toISOString() ?? null,
                trialEndsAt: ctx.subscription.trialEndsAt?.toISOString() ?? null,
              }
            : null,
        });
      } catch (e) {
        logDetailedError(LOG_PREFIX, `requestId=${requestId} failed`, e);
        return JSON.stringify({
          ok: false,
          errorMsg: e instanceof Error ? e.message : String(e),
        });
      }
    },
  });
}

export const getBillingStatusToolDefinition: ToolDefinition = {
  name: "getBillingStatus",
  displayName: "查询账户余额",
  category: "账户管理",
  stage: "monitor",
  description: "查询店铺订阅套餐与可用 token 余额，了解账户当前状态",
  systemPromptExtension:
    "当用户询问 token 余额、套餐状态、账户是否有效时，调用工具 get_billing_status。返回字段：availableTokens=可用 token，usedTokens=已用 token，hasAccess=是否有访问权限，subscription.planKey=套餐名，subscription.currentPeriodEnd=当前周期到期时间。若 hasAccess 为 false，告知用户需要订阅或购买 token 包。",
  createTool: (context) => createGetBillingStatusTool(context),
};
