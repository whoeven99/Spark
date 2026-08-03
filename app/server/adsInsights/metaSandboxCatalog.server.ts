/**
 * Meta 沙盒 DPA：自动发现 Product Catalog / Product Set。
 * 优先级：env → 店铺 Meta Catalog OAuth → 沙盒 token Graph API。
 */

import { getFacebookCatalogCredential } from "../adsCatalog/credentialStore.server";
import { getMetaCatalogs } from "../adsCatalog/metaOAuth.server";
import {
  metaGet,
  normalizeAdAccountId,
  readMetaSandboxEnv,
} from "./metaSandbox.server";

const LOG_PREFIX = "[AdsInsights][Meta][SandboxCatalog]";

export type MetaSandboxCatalogContext = {
  catalogId: string;
  productSetId: string;
  /** 用于读 product_sets 的 token（优先 Catalog OAuth） */
  catalogAccessToken: string;
  source:
    | "env"
    | "shop_catalog_credential"
    | "shop_meta_catalogs_api"
    | "sandbox_meta_catalogs_api"
    | "sandbox_ad_account_api"
    | "sandbox_business_api";
};

function uniqueCatalogIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export async function resolveFirstProductSetId(
  accessToken: string,
  catalogId: string,
): Promise<string | null> {
  try {
    const json = await metaGet<{ data?: Array<{ id?: string; name?: string }> }>(
      `${catalogId}/product_sets`,
      accessToken,
      { fields: "id,name", limit: "25" },
    );
    const rows = json.data ?? [];
    const preferred = rows.find((row) => /all products/i.test(row.name ?? ""));
    return (preferred ?? rows[0])?.id?.trim() || null;
  } catch {
    return null;
  }
}

async function resolveCatalogWithProductSet(params: {
  catalogId: string;
  tokens: string[];
  source: MetaSandboxCatalogContext["source"];
}): Promise<MetaSandboxCatalogContext | null> {
  for (const token of params.tokens) {
    if (!token) continue;
    const productSetId = await resolveFirstProductSetId(token, params.catalogId);
    if (productSetId) {
      return {
        catalogId: params.catalogId,
        productSetId,
        catalogAccessToken: token,
        source: params.source,
      };
    }
  }
  return null;
}

async function discoverCatalogIdsFromSandboxToken(
  accessToken: string,
  adAccountId: string,
): Promise<Array<{ catalogId: string; source: MetaSandboxCatalogContext["source"] }>> {
  const found: Array<{ catalogId: string; source: MetaSandboxCatalogContext["source"] }> = [];

  try {
    const catalogs = await getMetaCatalogs(accessToken);
    for (const row of catalogs) {
      if (row.catalogId) {
        found.push({ catalogId: row.catalogId, source: "sandbox_meta_catalogs_api" });
      }
    }
  } catch {
    // sandbox token 可能无 business_management
  }

  const accountPath = normalizeAdAccountId(adAccountId);
  try {
    const json = await metaGet<{ data?: Array<{ id?: string }> }>(
      `${accountPath}/product_catalogs`,
      accessToken,
      { fields: "id,name", limit: "25" },
    );
    for (const row of json.data ?? []) {
      const id = row.id?.trim();
      if (id) found.push({ catalogId: id, source: "sandbox_ad_account_api" });
    }
  } catch {
    // 部分账户无此边
  }

  try {
    const businesses = await metaGet<{ data?: Array<{ id?: string }> }>(
      "me/businesses",
      accessToken,
      { fields: "id", limit: "25" },
    );
    for (const biz of businesses.data ?? []) {
      const businessId = biz.id?.trim();
      if (!businessId) continue;
      for (const edge of ["owned_product_catalogs", "client_product_catalogs"] as const) {
        try {
          const json = await metaGet<{ data?: Array<{ id?: string }> }>(
            `${businessId}/${edge}`,
            accessToken,
            { fields: "id,name", limit: "25" },
          );
          for (const row of json.data ?? []) {
            const id = row.id?.trim();
            if (id) found.push({ catalogId: id, source: "sandbox_business_api" });
          }
        } catch {
          // 跳过无权限 Business
        }
      }
    }
  } catch {
    // 无 business 权限
  }

  const seen = new Set<string>();
  return found.filter((row) => {
    if (seen.has(row.catalogId)) return false;
    seen.add(row.catalogId);
    return true;
  });
}

function formatCatalogSourceLabel(source: MetaSandboxCatalogContext["source"]): string {
  switch (source) {
    case "env":
      return "环境变量";
    case "shop_catalog_credential":
      return "店铺 Meta Catalog 授权";
    case "shop_meta_catalogs_api":
      return "店铺 Catalog token + Graph API";
    case "sandbox_meta_catalogs_api":
      return "沙盒 token + getMetaCatalogs";
    case "sandbox_ad_account_api":
      return "沙盒 token + 广告账户 product_catalogs";
    case "sandbox_business_api":
      return "沙盒 token + Business owned/client catalogs";
    default:
      return source;
  }
}

export function formatCatalogSourceLabelForUi(
  source: MetaSandboxCatalogContext["source"],
): string {
  return formatCatalogSourceLabel(source);
}

/**
 * 自动发现可用于 DPA seed 的 Catalog + Product Set。
 */
export async function resolveSandboxCatalogContext(params: {
  sandboxAccessToken: string;
  adAccountId: string;
  shop?: string | null;
}): Promise<MetaSandboxCatalogContext | null> {
  const envCatalogId = readMetaSandboxEnv("META_SANDBOX_PRODUCT_CATALOG_ID");
  const envProductSetId = readMetaSandboxEnv("META_SANDBOX_PRODUCT_SET_ID");
  const tokenCandidates = uniqueCatalogIds([params.sandboxAccessToken]);

  if (envCatalogId) {
    if (envProductSetId) {
      return {
        catalogId: envCatalogId,
        productSetId: envProductSetId,
        catalogAccessToken: params.sandboxAccessToken,
        source: "env",
      };
    }
    const resolved = await resolveCatalogWithProductSet({
      catalogId: envCatalogId,
      tokens: tokenCandidates,
      source: "env",
    });
    if (resolved) return resolved;
  }

  if (params.shop) {
    const shopCred = await getFacebookCatalogCredential(params.shop);
    if (shopCred?.catalogId) {
      const shopTokens = uniqueCatalogIds([shopCred.accessToken, params.sandboxAccessToken]);
      const fromCredential = await resolveCatalogWithProductSet({
        catalogId: shopCred.catalogId,
        tokens: shopTokens,
        source: "shop_catalog_credential",
      });
      if (fromCredential) return fromCredential;

      try {
        const catalogs = await getMetaCatalogs(shopCred.accessToken);
        for (const row of catalogs) {
          const resolved = await resolveCatalogWithProductSet({
            catalogId: row.catalogId,
            tokens: shopTokens,
            source: "shop_meta_catalogs_api",
          });
          if (resolved) return resolved;
        }
      } catch (e) {
        console.warn(`${LOG_PREFIX} shop getMetaCatalogs failed`, e);
      }
    }
  }

  const discovered = await discoverCatalogIdsFromSandboxToken(
    params.sandboxAccessToken,
    params.adAccountId,
  );
  for (const row of discovered) {
    const resolved = await resolveCatalogWithProductSet({
      catalogId: row.catalogId,
      tokens: tokenCandidates,
      source: row.source,
    });
    if (resolved) return resolved;
  }

  return null;
}

export type MetaSandboxCatalogDiscovery = {
  catalogs: Array<{ catalogId: string; name?: string; source: string }>;
  shopCatalogConnected: boolean;
  shopCatalogId: string | null;
};

/** 诊断脚本 / UI：列举当前可发现的 Catalog（不保证有 product set）。 */
export async function listDiscoverableMetaSandboxCatalogs(params: {
  sandboxAccessToken: string;
  adAccountId: string;
  shop?: string | null;
}): Promise<MetaSandboxCatalogDiscovery> {
  const catalogs: MetaSandboxCatalogDiscovery["catalogs"] = [];
  const seen = new Set<string>();

  const push = (catalogId: string, source: string, name?: string) => {
    if (!catalogId || seen.has(catalogId)) return;
    seen.add(catalogId);
    catalogs.push({ catalogId, name, source });
  };

  const envCatalogId = readMetaSandboxEnv("META_SANDBOX_PRODUCT_CATALOG_ID");
  if (envCatalogId) push(envCatalogId, "env");

  let shopCatalogConnected = false;
  let shopCatalogId: string | null = null;

  if (params.shop) {
    const shopCred = await getFacebookCatalogCredential(params.shop);
    if (shopCred?.catalogId) {
      shopCatalogConnected = true;
      shopCatalogId = shopCred.catalogId;
      push(shopCred.catalogId, "shop_catalog_credential");
      try {
        for (const row of await getMetaCatalogs(shopCred.accessToken)) {
          push(row.catalogId, "shop_meta_catalogs_api", row.name);
        }
      } catch {
        // ignore
      }
    }
  }

  for (const row of await discoverCatalogIdsFromSandboxToken(
    params.sandboxAccessToken,
    params.adAccountId,
  )) {
    push(row.catalogId, row.source);
  }

  return { catalogs, shopCatalogConnected, shopCatalogId };
}
