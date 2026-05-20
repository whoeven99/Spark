import { resolveTursoTarget } from "../../../config/tursoTarget.server";
import type { UninstallSessionSnapshot } from "../../commonEventLog/loadSessionSnapshotForUninstall.server";
import type { ShopBasicInfo } from "../../shopify/fetchShopBasicInfo.server";

export type InstallOpsTemplateInput = {
  shop: string;
  appName: string;
  source?: string;
  installedAt: Date;
  shopInfo?: ShopBasicInfo | null;
  sessionSnapshot?: UninstallSessionSnapshot | null;
};

function formatPlanLabel(info?: ShopBasicInfo | null): string {
  if (!info) return "";
  const bits: string[] = [];
  if (info.planName) bits.push(info.planName);
  if (info.shopifyPlus) bits.push("Shopify Plus");
  if (info.partnerDevelopment) bits.push("Partner Dev");
  return bits.join(", ");
}

function formatDisplayName(snapshot?: UninstallSessionSnapshot | null): string {
  const first = snapshot?.firstName?.trim() ?? "";
  const last = snapshot?.lastName?.trim() ?? "";
  const combined = [first, last].filter(Boolean).join(" ").trim();
  return combined;
}

function resolveUserLabel(
  shop: string,
  info?: ShopBasicInfo | null,
  snapshot?: UninstallSessionSnapshot | null,
): string {
  const fromProfile = formatDisplayName(snapshot);
  if (fromProfile) return fromProfile;
  if (info?.name?.trim()) return info.name.trim();
  const email =
    snapshot?.email?.trim() ||
    info?.email?.trim() ||
    info?.contactEmail?.trim();
  if (email) {
    const local = email.split("@")[0]?.trim();
    if (local) return local;
  }
  return shop.replace(".myshopify.com", "");
}

/**
 * 组装安装运营邮件 templateData（137916 至少需要 `user`）。
 */
export function buildInstallOpsTemplateData(
  input: InstallOpsTemplateInput,
): Record<string, string> {
  const shopDomain =
    input.shopInfo?.myshopifyDomain?.trim() || input.shop;
  const environment = resolveTursoTarget();
  const installedAtIso = input.installedAt.toISOString();
  const ownerEmail =
    input.sessionSnapshot?.email?.trim() ||
    input.shopInfo?.email?.trim() ||
    input.shopInfo?.contactEmail?.trim() ||
    "";

  return {
    user: resolveUserLabel(input.shop, input.shopInfo, input.sessionSnapshot),
    first_name: input.sessionSnapshot?.firstName?.trim() || "",
    second_name: input.sessionSnapshot?.lastName?.trim() || "",
    shop_name: input.shopInfo?.name?.trim() || shopDomain,
    shop_domain: shopDomain,
    owner_email: ownerEmail,
    plan: formatPlanLabel(input.shopInfo),
    environment,
    app_name: input.appName,
    install_source: input.source ?? "unknown",
    installed_at: installedAtIso,
  };
}
