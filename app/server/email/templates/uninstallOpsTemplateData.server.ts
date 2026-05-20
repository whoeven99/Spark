import { resolveTursoTarget } from "../../../config/tursoTarget.server";
import type { UninstallSessionSnapshot } from "../../commonEventLog/loadSessionSnapshotForUninstall.server";

export type UninstallOpsTemplateInput = {
  shop: string;
  appName: string;
  uninstalledAt: Date;
  installDurationMs?: number | null;
  sessionSnapshot?: UninstallSessionSnapshot | null;
};

function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "unknown";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function shopDisplayName(shop: string): string {
  return shop.replace(/\.myshopify\.com$/i, "") || shop;
}

function formatDisplayName(snapshot?: UninstallOpsTemplateInput["sessionSnapshot"]): string {
  const first = snapshot?.firstName?.trim() ?? "";
  const last = snapshot?.lastName?.trim() ?? "";
  return [first, last].filter(Boolean).join(" ").trim();
}

export function buildUninstallOpsTemplateData(
  input: UninstallOpsTemplateInput,
): Record<string, string> {
  const shopDomain = input.shop.trim();
  const fallbackName = shopDisplayName(shopDomain);
  const displayName = formatDisplayName(input.sessionSnapshot) || fallbackName;

  return {
    user: displayName,
    first_name: input.sessionSnapshot?.firstName?.trim() || "",
    second_name: input.sessionSnapshot?.lastName?.trim() || "",
    shop_name: displayName,
    shop_domain: shopDomain,
    owner_email: input.sessionSnapshot?.email?.trim() || "",
    plan: "",
    environment: resolveTursoTarget(),
    app_name: input.appName,
    uninstalled_at: input.uninstalledAt.toISOString(),
    install_duration: formatDuration(input.installDurationMs),
  };
}
