import {
  clearMetaAdsPending,
  clearMetaCapiPending,
  clearMetaCatalogPending,
  getFacebookCatalogCredential,
  getMetaAdsCredential,
  setFacebookCatalogCredential,
  setMetaAdsCredential,
  setMetaAdsPending,
  setMetaCapiPending,
  setMetaCatalogPending,
  type FacebookCatalogCredential,
  type MetaAdsCredential,
  type PendingOAuthAccount,
  type PendingOAuthTokens,
} from "./credentialStore.server";
import { persistMetaCapiBisuOnboarding } from "./metaCapiOnboarding.server";
import {
  getMetaAdAccounts,
  getMetaCatalogs,
  type MetaAdAccount,
  type MetaCatalogAccount,
} from "./metaOAuth.server";

const LOG_PREFIX = "[AdsCatalog][MetaUnified]";

export type MetaCapabilityStatus =
  | "success"
  | "select"
  | "empty"
  | "error"
  | "blocked";

export type MetaCapabilityResult = {
  status: MetaCapabilityStatus;
  reason?: string;
};

export type MetaUnifiedOnboardingResult = {
  catalog: MetaCapabilityResult;
  ads: MetaCapabilityResult;
  capi: MetaCapabilityResult;
};

export const META_UNIFIED_CATALOG_EMPTY =
  "统一授权账号没有可访问的 Meta Catalog";
export const META_UNIFIED_ADS_EMPTY =
  "该 Meta 账号未关联任何广告账户，请先在 Meta Business 中创建或获得访问权限";
export const META_UNIFIED_CAPI_BLOCKED =
  "请先完成 Catalog 授权后再连接 CAPI";

export type MetaUnifiedOnboardingDeps = {
  getFacebookCatalogCredential: (shop: string) => Promise<FacebookCatalogCredential | null>;
  setFacebookCatalogCredential: typeof setFacebookCatalogCredential;
  setMetaCatalogPending: (shop: string, payload: PendingOAuthTokens) => Promise<void>;
  clearMetaCatalogPending: (shop: string) => Promise<void>;
  getMetaCatalogs: (accessToken: string) => Promise<MetaCatalogAccount[]>;
  getMetaAdsCredential: (shop: string) => Promise<MetaAdsCredential | null>;
  setMetaAdsCredential: typeof setMetaAdsCredential;
  setMetaAdsPending: (shop: string, payload: PendingOAuthTokens) => Promise<void>;
  clearMetaAdsPending: (shop: string) => Promise<void>;
  getMetaAdAccounts: (accessToken: string) => Promise<MetaAdAccount[]>;
  persistMetaCapiBisuOnboarding: typeof persistMetaCapiBisuOnboarding;
  setMetaCapiPending: (shop: string, payload: PendingOAuthTokens) => Promise<void>;
  clearMetaCapiPending: (shop: string) => Promise<void>;
};

const defaultDeps: MetaUnifiedOnboardingDeps = {
  getFacebookCatalogCredential,
  setFacebookCatalogCredential,
  setMetaCatalogPending,
  clearMetaCatalogPending,
  getMetaCatalogs,
  getMetaAdsCredential,
  setMetaAdsCredential,
  setMetaAdsPending,
  clearMetaAdsPending,
  getMetaAdAccounts,
  persistMetaCapiBisuOnboarding,
  setMetaCapiPending,
  clearMetaCapiPending,
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isIncomplete(status: MetaCapabilityStatus): boolean {
  return status === "error" || status === "empty" || status === "blocked";
}

function isSettled(status: MetaCapabilityStatus): boolean {
  return status === "success" || status === "select";
}

export function summarizeMetaUnifiedAuth(result: MetaUnifiedOnboardingResult): {
  metaUnifiedAuth: "success" | "partial" | "error";
  reason?: string;
} {
  const capabilities = [result.catalog, result.ads, result.capi];
  const incomplete = capabilities.filter((item) => isIncomplete(item.status));
  const hasSettled = capabilities.some((item) => isSettled(item.status));
  const reason = incomplete
    .map((item) => item.reason?.trim())
    .filter((item): item is string => Boolean(item))
    .join("；");

  if (!hasSettled) {
    return { metaUnifiedAuth: "error", ...(reason ? { reason } : {}) };
  }
  if (incomplete.length > 0) {
    return { metaUnifiedAuth: "partial", ...(reason ? { reason } : {}) };
  }
  return { metaUnifiedAuth: "success" };
}

export function toMetaUnifiedAuthParams(
  result: MetaUnifiedOnboardingResult,
): Record<string, string> {
  const summary = summarizeMetaUnifiedAuth(result);
  return {
    metaUnifiedAuth: summary.metaUnifiedAuth,
    metaCatalog: result.catalog.status,
    metaAds: result.ads.status,
    metaCapi: result.capi.status,
    ...(summary.reason ? { reason: summary.reason } : {}),
  };
}

async function bindCatalog(
  shop: string,
  token: string,
  deps: MetaUnifiedOnboardingDeps,
): Promise<MetaCapabilityResult> {
  let catalogs: MetaCatalogAccount[];
  try {
    catalogs = await deps.getMetaCatalogs(token);
  } catch (error) {
    return { status: "error", reason: errorMessage(error, "无法读取 Meta Catalog") };
  }
  if (catalogs.length === 0) {
    return { status: "empty", reason: META_UNIFIED_CATALOG_EMPTY };
  }

  const existing = await deps.getFacebookCatalogCredential(shop);
  const selected =
    catalogs.find((catalog) => catalog.catalogId === existing?.catalogId) ??
    (catalogs.length === 1 ? catalogs[0] : null);
  if (!selected?.catalogId) {
    await deps.setMetaCatalogPending(shop, {
      accessToken: token,
      accounts: catalogs.map((catalog) => ({
        id: catalog.catalogId,
        name: catalog.name,
        businessId: catalog.businessId,
      })),
    });
    return { status: "select" };
  }

  await deps.setFacebookCatalogCredential(shop, {
    accessToken: token,
    catalogId: selected.catalogId,
    businessId: selected.businessId ?? existing?.businessId,
    apiVersion: existing?.apiVersion,
    pixelId: existing?.pixelId,
    testEventCode: existing?.testEventCode,
    enabledEvents: existing?.enabledEvents,
    capiEnabled: existing?.capiEnabled ?? true,
  });
  await deps.clearMetaCatalogPending(shop);
  return { status: "success" };
}

function mapAdAccounts(accounts: MetaAdAccount[]): PendingOAuthAccount[] {
  return accounts.map((account) => ({
    id: account.adAccountId,
    name: account.name,
    formatted: account.currencyCode,
  }));
}

async function bindAds(
  shop: string,
  token: string,
  deps: MetaUnifiedOnboardingDeps,
): Promise<MetaCapabilityResult> {
  let accounts: MetaAdAccount[];
  try {
    accounts = await deps.getMetaAdAccounts(token);
  } catch (error) {
    return { status: "error", reason: errorMessage(error, "无法读取 Meta 广告账户") };
  }
  if (accounts.length === 0) {
    return { status: "empty", reason: META_UNIFIED_ADS_EMPTY };
  }

  const existing = await deps.getMetaAdsCredential(shop);
  const selected =
    accounts.find((account) => account.adAccountId === existing?.adAccountId) ??
    (accounts.length === 1 ? accounts[0] : null);
  if (!selected) {
    await deps.setMetaAdsPending(shop, {
      accessToken: token,
      accounts: mapAdAccounts(accounts),
    });
    return { status: "select" };
  }

  await deps.setMetaAdsCredential(shop, {
    accessToken: token,
    adAccountId: selected.adAccountId,
    adAccountName: selected.name,
    currencyCode: selected.currencyCode,
    availableAccounts: mapAdAccounts(accounts),
  });
  await deps.clearMetaAdsPending(shop);
  return { status: "success" };
}

async function bindCapi(
  shop: string,
  token: string,
  deps: MetaUnifiedOnboardingDeps,
): Promise<MetaCapabilityResult> {
  const catalog = await deps.getFacebookCatalogCredential(shop);
  if (!catalog) {
    return { status: "blocked", reason: META_UNIFIED_CAPI_BLOCKED };
  }

  try {
    const capiResult = await deps.persistMetaCapiBisuOnboarding({
      shop,
      capiAccessToken: token,
      businessId: catalog.businessId,
      apiVersion: catalog.apiVersion,
      pixelId: catalog.pixelId,
    });
    if (capiResult.status === "select") {
      await deps.setMetaCapiPending(shop, {
        accessToken: token,
        accounts: capiResult.pixels.map((pixel) => ({
          id: pixel.pixelId,
          name: pixel.pixelName,
          businessId: capiResult.businessId,
        })),
      });
      return { status: "select" };
    }
    await deps.clearMetaCapiPending(shop);
    return { status: "success" };
  } catch (error) {
    return { status: "error", reason: errorMessage(error, "CAPI 授权失败") };
  }
}

export async function completeMetaUnifiedOnboarding(params: {
  shop: string;
  token: string;
  deps?: Partial<MetaUnifiedOnboardingDeps>;
}): Promise<MetaUnifiedOnboardingResult> {
  const deps = { ...defaultDeps, ...params.deps };
  const catalog = await bindCatalog(params.shop, params.token, deps);
  const ads = await bindAds(params.shop, params.token, deps);
  const capi = await bindCapi(params.shop, params.token, deps);
  const result = { catalog, ads, capi };
  const summary = summarizeMetaUnifiedAuth(result);
  console.info(
    `${LOG_PREFIX} step=${summary.metaUnifiedAuth} shop=${params.shop} catalog=${catalog.status} ads=${ads.status} capi=${capi.status}`,
  );
  return result;
}
