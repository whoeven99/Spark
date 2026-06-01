import { getAppEntry } from "../../../../config/appEntry.server";
import { EMAIL_TEMPLATE_IDS } from "../../../email/templates/emailTemplates.server";
import { buildNotificationDashboardUrl } from "../../../notifications/buildNotificationDashboardUrl.server";
import { buildNotificationTemplateData } from "../../../notifications/buildNotificationTemplateData.server";
import {
  buildAppInstalledVariables,
  buildAppUninstalledVariables,
  formatOccurredAtUtc,
} from "../../../notifications/buildNotificationVariables.server";
import { getNotificationAppConfig } from "../../../notifications/config";
import type { BaseNotificationVariables } from "../../../notifications/types";
import { fetchShopBasicInfo, type ShopBasicInfo } from "../../../shopify/fetchShopBasicInfo.server";
import type { AgentContext } from "../../core/toolRegistry.server";

/** 兼容 Agent 历史错误键名 APP_Name → appName */
export function normalizeAgentTemplateDataKeys(
  data?: Record<string, string>,
): Record<string, string> {
  if (!data) return {};
  const normalized = { ...data };
  if (normalized.APP_Name !== undefined && normalized.appName === undefined) {
    normalized.appName = normalized.APP_Name;
  }
  delete normalized.APP_Name;
  return normalized;
}

function resolveAppKey(context: AgentContext): string {
  return context.appName?.trim() || getAppEntry();
}

/**
 * 服务端解析商家收件邮箱：优先店主账户邮箱，其次客服联系邮箱。
 * 收件人不由 Agent 指定，杜绝越权/幻觉发往任意地址。
 */
export function resolveMerchantEmail(shopInfo: ShopBasicInfo | null): string | null {
  const email = shopInfo?.email?.trim() || shopInfo?.contactEmail?.trim() || "";
  return email.length > 0 ? email : null;
}

/**
 * 拉取店铺基础信息（容错）。供收件人解析与 templateData 补全共用，避免重复请求。
 */
export async function loadShopBasicInfoSafe(
  context: AgentContext,
): Promise<ShopBasicInfo | null> {
  if (!context.admin) {
    if (context.shop?.trim()) {
      console.warn(
        "[EmailTool] enrichAgentTemplateData missing admin client; shop fields may be empty",
      );
    }
    return null;
  }
  try {
    return await fetchShopBasicInfo(context.admin);
  } catch (error) {
    console.warn(
      "[EmailTool] enrichAgentTemplateData fetchShopBasicInfo failed:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

function buildBaseVariables(
  templateId: number,
  context: AgentContext,
  now: Date,
  shopInfo: ShopBasicInfo | null,
): BaseNotificationVariables & { installedAtUtc?: string; uninstalledAtUtc?: string } {
  const shop = context.shop?.trim() ?? "";

  const resolvedShop =
    shop || shopInfo?.myshopifyDomain?.trim() || "";

  if (templateId === EMAIL_TEMPLATE_IDS.APP_INSTALL_SUCCESS) {
    return buildAppInstalledVariables({
      shop: resolvedShop,
      installedAt: now,
      shopInfo,
    });
  }

  if (templateId === EMAIL_TEMPLATE_IDS.APP_UNINSTALL) {
    return buildAppUninstalledVariables({
      shop: resolvedShop,
      uninstalledAt: now,
    });
  }

  const shopDomain = shopInfo?.myshopifyDomain?.trim() || resolvedShop;
  const shopName = shopInfo?.name?.trim() || shopDomain;

  return {
    shopName,
    shopDomain,
    occurredAtUtc: formatOccurredAtUtc(now),
    recipientName: "",
  };
}

/**
 * 为 Agent 邮件工具补全 templateData：通用字段 + 180498/180499 生命周期字段。
 * Agent 显式传入的值覆盖服务端默认值。
 */
export async function enrichAgentTemplateData(
  templateId: number,
  context: AgentContext,
  agentData?: Record<string, string>,
  shopInfo?: ShopBasicInfo | null,
): Promise<Record<string, string>> {
  const normalizedAgentData = normalizeAgentTemplateDataKeys(agentData);
  const appKey = resolveAppKey(context);
  const appConfig = getNotificationAppConfig(appKey);
  const dashboardUrl = context.shop?.trim()
    ? buildNotificationDashboardUrl(context.shop.trim(), appKey)
    : undefined;
  const configWithDashboard = dashboardUrl
    ? { ...appConfig, dashboardUrl }
    : appConfig;

  const resolvedShopInfo =
    shopInfo !== undefined ? shopInfo : await loadShopBasicInfoSafe(context);
  const now = new Date();
  const variables = buildBaseVariables(templateId, context, now, resolvedShopInfo);
  const serverBuilt = buildNotificationTemplateData(configWithDashboard, variables);

  return { ...serverBuilt, ...normalizedAgentData };
}
