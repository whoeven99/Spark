import {
  listMetaAdAccountPixels,
  listMetaBusinessPixels,
  type MetaPixelListItem,
} from "./clients/facebookGraphClient.server";
import {
  clearMetaBusinessPending,
  getFacebookCatalogCredential,
  setFacebookCatalogCredential,
  setMetaAdsCredential,
  setMetaBusinessPending,
  type MetaBusinessPendingSelection,
  type PendingOAuthAccount,
} from "./credentialStore.server";
import { fetchMetaBisuClientBusinessId } from "./metaCapiOnboarding.server";
import {
  META_GRAPH_BASE,
  resolveMetaBusinessLoginConfigId,
} from "./metaOAuth.server";

export { resolveMetaBusinessLoginConfigId };

const LOG_PREFIX = "[AdsCatalog][MetaBusinessOnboarding]";

export function isMetaBusinessLoginConfigured(): boolean {
  return Boolean(resolveMetaBusinessLoginConfigId());
}

export type MetaBusinessCatalog = { catalogId: string; name?: string };
export type MetaBusinessAdAccount = {
  adAccountId: string;
  name?: string;
  currencyCode?: string;
};

export type MetaBusinessDiscoveredAssets = {
  businessId: string;
  catalogs: MetaBusinessCatalog[];
  adAccounts: MetaBusinessAdAccount[];
  pixels: MetaPixelListItem[];
};

async function fetchBusinessGraphCollection<T>(params: {
  path: string;
  accessToken: string;
  fields: string;
}): Promise<T[]> {
  const url = new URL(`${META_GRAPH_BASE}/${params.path.replace(/^\//, "")}`);
  url.searchParams.set("fields", params.fields);
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", params.accessToken.trim());

  const out: T[] = [];
  let nextUrl: string | null = url.toString();
  let pages = 0;
  while (nextUrl && pages < 5) {
    pages += 1;
    const response = await fetch(nextUrl);
    const json = (await response.json().catch(() => ({}))) as {
      data?: T[];
      paging?: { next?: string };
      error?: { message?: string; code?: number; type?: string };
    };
    if (!response.ok) {
      const errMsg = json.error?.message || `HTTP ${response.status}`;
      console.error(
        `${LOG_PREFIX} step=graph_collection path=${params.path} http=${response.status} code=${json.error?.code ?? ""} err=${errMsg}`,
      );
      throw new Error(errMsg);
    }
    out.push(...(json.data ?? []));
    nextUrl = json.paging?.next ?? null;
  }
  return out;
}

export async function listMetaBusinessCatalogs(params: {
  businessId: string;
  accessToken: string;
}): Promise<MetaBusinessCatalog[]> {
  const businessId = params.businessId.trim();
  const rows = await fetchBusinessGraphCollection<{
    id?: string;
    name?: string;
  }>({
    path: `${encodeURIComponent(businessId)}/owned_product_catalogs`,
    accessToken: params.accessToken,
    fields: "id,name",
  });

  const clientRows = await fetchBusinessGraphCollection<{
    id?: string;
    name?: string;
  }>({
    path: `${encodeURIComponent(businessId)}/client_product_catalogs`,
    accessToken: params.accessToken,
    fields: "id,name",
  }).catch(() => []);

  const out: MetaBusinessCatalog[] = [];
  const seen = new Set<string>();
  for (const row of [...rows, ...clientRows]) {
    const catalogId = String(row.id ?? "").trim();
    if (!catalogId || seen.has(catalogId)) continue;
    seen.add(catalogId);
    out.push({ catalogId, name: row.name?.trim() || undefined });
  }
  return out;
}

export async function listMetaBusinessAdAccounts(params: {
  businessId: string;
  accessToken: string;
}): Promise<MetaBusinessAdAccount[]> {
  const businessId = params.businessId.trim();
  const rows = await fetchBusinessGraphCollection<{
    id?: string;
    name?: string;
    account_id?: string;
    currency?: string;
  }>({
    path: `${encodeURIComponent(businessId)}/owned_ad_accounts`,
    accessToken: params.accessToken,
    fields: "id,name,account_id,currency",
  });

  const out: MetaBusinessAdAccount[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const adAccountId = (row.id || (row.account_id ? `act_${row.account_id}` : "")).trim();
    if (!adAccountId || seen.has(adAccountId)) continue;
    seen.add(adAccountId);
    out.push({
      adAccountId,
      name: row.name?.trim() || undefined,
      currencyCode: row.currency?.trim() || undefined,
    });
  }

  if (out.length > 0) return out;

  const meRows = await fetchBusinessGraphCollection<{
    id?: string;
    name?: string;
    account_id?: string;
    currency?: string;
  }>({
    path: "me/adaccounts",
    accessToken: params.accessToken,
    fields: "id,name,account_id,currency",
  });
  for (const row of meRows) {
    const adAccountId = (row.id || (row.account_id ? `act_${row.account_id}` : "")).trim();
    if (!adAccountId || seen.has(adAccountId)) continue;
    seen.add(adAccountId);
    out.push({
      adAccountId,
      name: row.name?.trim() || undefined,
      currencyCode: row.currency?.trim() || undefined,
    });
  }
  return out;
}

export async function discoverMetaBusinessAssets(params: {
  accessToken: string;
  businessId?: string;
}): Promise<MetaBusinessDiscoveredAssets> {
  const accessToken = params.accessToken.trim();
  const businessId =
    params.businessId?.trim() ||
    (await fetchMetaBisuClientBusinessId({ accessToken }));

  const [catalogs, adAccounts, ownedPixels] = await Promise.all([
    listMetaBusinessCatalogs({ businessId, accessToken }),
    listMetaBusinessAdAccounts({ businessId, accessToken }),
    listMetaBusinessPixels({ accessToken, businessId }).catch(() => [] as MetaPixelListItem[]),
  ]);

  let pixels = ownedPixels;
  if (pixels.length === 0 && adAccounts.length > 0) {
    const seen = new Set<string>();
    for (const account of adAccounts.slice(0, 10)) {
      try {
        const accountPixels = await listMetaAdAccountPixels({
          accessToken,
          adAccountId: account.adAccountId,
        });
        for (const pixel of accountPixels) {
          if (seen.has(pixel.pixelId)) continue;
          seen.add(pixel.pixelId);
          pixels.push(pixel);
        }
      } catch (e) {
        console.warn(
          `${LOG_PREFIX} step=pixel_discover_failed adAccountId=${account.adAccountId} err=${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  return { businessId, catalogs, adAccounts, pixels };
}

function mapAdAccountsForStore(
  adAccounts: MetaBusinessAdAccount[],
): PendingOAuthAccount[] {
  return adAccounts.map((a) => ({
    id: a.adAccountId,
    name: a.name,
    formatted: a.currencyCode,
  }));
}

export async function saveMetaBusinessCredentials(params: {
  shop: string;
  bisuToken: string;
  businessId: string;
  catalogId: string;
  adAccountId: string;
  adAccountName?: string;
  currencyCode?: string;
  availableAdAccounts?: MetaBusinessAdAccount[];
  pixelId?: string;
  enabledEvents?: string[];
}): Promise<void> {
  const shop = params.shop.trim().toLowerCase();
  const bisuToken = params.bisuToken.trim();
  const catalogId = params.catalogId.trim();
  const adAccountId = params.adAccountId.trim();
  if (!shop || !bisuToken || !catalogId || !adAccountId) {
    throw new Error("Meta Business 凭证缺少 shop / token / catalogId / adAccountId");
  }

  const existing = await getFacebookCatalogCredential(shop);
  const configId = resolveMetaBusinessLoginConfigId() ?? undefined;
  const obtainedAt = new Date().toISOString();
  const pixelId = params.pixelId?.trim() || existing?.pixelId?.trim() || undefined;

  await setFacebookCatalogCredential(shop, {
    accessToken: bisuToken,
    catalogId,
    businessId: params.businessId.trim(),
    pixelId,
    capiAccessToken: bisuToken,
    capiTokenType: "bisu",
    capiConfigId: configId,
    capiTokenObtainedAt: obtainedAt,
    capiEnabled: true,
    enabledEvents: params.enabledEvents ?? existing?.enabledEvents,
    testEventCode: existing?.testEventCode,
  });

  await setMetaAdsCredential(shop, {
    accessToken: bisuToken,
    adAccountId,
    adAccountName: params.adAccountName,
    currencyCode: params.currencyCode,
    availableAccounts: mapAdAccountsForStore(
      params.availableAdAccounts ?? [
        {
          adAccountId,
          name: params.adAccountName,
          currencyCode: params.currencyCode,
        },
      ],
    ),
  });

  await clearMetaBusinessPending(shop);
  console.info(
    `${LOG_PREFIX} step=saved shop=${shop} businessId=${params.businessId} catalogId=${catalogId} adAccountId=${adAccountId} pixelId=${pixelId ?? ""}`,
  );
}

export type PersistMetaBusinessOnboardingResult =
  | { status: "saved"; catalogId: string; adAccountId: string; pixelId?: string }
  | { status: "select"; pending: MetaBusinessPendingSelection };

export async function persistMetaBusinessOnboarding(params: {
  shop: string;
  bisuToken: string;
  businessId?: string;
}): Promise<PersistMetaBusinessOnboardingResult> {
  const shop = params.shop.trim().toLowerCase();
  const bisuToken = params.bisuToken.trim();
  if (!bisuToken) throw new Error("Meta Business token is required");

  const assets = await discoverMetaBusinessAssets({
    accessToken: bisuToken,
    businessId: params.businessId,
  });

  if (assets.catalogs.length === 0) {
    throw new Error("该 Meta Business 未关联任何商品 Catalog，请先在 Meta Commerce 中创建");
  }
  if (assets.adAccounts.length === 0) {
    throw new Error("该 Meta Business 未关联任何广告账户，请先在 Meta Business 中创建或授权");
  }

  const needsSelect =
    assets.catalogs.length > 1 ||
    assets.adAccounts.length > 1 ||
    assets.pixels.length > 1;

  if (needsSelect) {
    const pending: MetaBusinessPendingSelection = {
      accessToken: bisuToken,
      businessId: assets.businessId,
      catalogs: assets.catalogs.map((c) => ({
        id: c.catalogId,
        name: c.name,
        businessId: assets.businessId,
      })),
      adAccounts: mapAdAccountsForStore(assets.adAccounts),
      pixels: assets.pixels.map((p) => ({
        id: p.pixelId,
        name: p.pixelName,
        businessId: assets.businessId,
      })),
    };
    await setMetaBusinessPending(shop, pending);
    console.info(
      `${LOG_PREFIX} step=select shop=${shop} catalogs=${assets.catalogs.length} adAccounts=${assets.adAccounts.length} pixels=${assets.pixels.length}`,
    );
    return { status: "select", pending };
  }

  const catalog = assets.catalogs[0];
  const adAccount = assets.adAccounts[0];
  const pixelId = assets.pixels[0]?.pixelId;

  await saveMetaBusinessCredentials({
    shop,
    bisuToken,
    businessId: assets.businessId,
    catalogId: catalog.catalogId,
    adAccountId: adAccount.adAccountId,
    adAccountName: adAccount.name,
    currencyCode: adAccount.currencyCode,
    availableAdAccounts: assets.adAccounts,
    pixelId,
  });

  return {
    status: "saved",
    catalogId: catalog.catalogId,
    adAccountId: adAccount.adAccountId,
    pixelId,
  };
}

export async function confirmMetaBusinessPendingSelection(params: {
  shop: string;
  catalogId: string;
  adAccountId: string;
  pixelId?: string;
}): Promise<void> {
  const shop = params.shop.trim().toLowerCase();
  const catalogId = params.catalogId.trim();
  const adAccountId = params.adAccountId.trim();
  const pixelId = params.pixelId?.trim();

  const { getMetaBusinessPending } = await import("./credentialStore.server");
  const pending = await getMetaBusinessPending(shop);
  if (!pending) {
    throw new Error("没有待选择的 Meta Business 授权会话，请重新连接");
  }

  const catalog = pending.catalogs.find((c) => c.id === catalogId);
  if (!catalog) throw new Error("catalogId 不在授权列表中");

  const adAccount = pending.adAccounts.find((a) => a.id === adAccountId);
  if (!adAccount) throw new Error("adAccountId 不在授权列表中");

  if (pixelId && pending.pixels.length > 0 && !pending.pixels.some((p) => p.id === pixelId)) {
    throw new Error("pixelId 不在授权列表中");
  }

  await saveMetaBusinessCredentials({
    shop,
    bisuToken: pending.accessToken,
    businessId: pending.businessId,
    catalogId,
    adAccountId,
    adAccountName: adAccount.name,
    currencyCode: adAccount.formatted,
    availableAdAccounts: pending.adAccounts.map((a) => ({
      adAccountId: a.id,
      name: a.name,
      currencyCode: a.formatted,
    })),
    pixelId: pixelId || pending.pixels[0]?.id,
  });
}
