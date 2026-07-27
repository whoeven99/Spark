import {
  getTiktokCatalogCredential,
  getTiktokCatalogPending,
  setTiktokCatalogCredential,
  clearTiktokCatalogPending,
} from "./credentialStore.server";
import type { TiktokCatalogBindingMode } from "./tiktokOAuth.server";
import {
  getTiktokCatalogsForAdvertisers,
  listAuthorizedAdvertiserIds,
  resolveTiktokBindingMode,
  type TiktokCatalogInfo,
} from "./tiktokOAuth.server";
import { fetchTiktokCatalogConf } from "./clients/tiktokCatalogClient.server";

export type TiktokCatalogListItem = {
  id: string;
  name: string;
  bindingMode: TiktokCatalogBindingMode;
  isShopifyOfficial: boolean;
  bcId: string;
  advertiserId: string;
  currency?: string;
  regionCode?: string;
  channel?: string;
};

async function resolveTiktokAccessToken(shop: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  advertiserIds: string[];
}> {
  const credential = await getTiktokCatalogCredential(shop);
  const pending = await getTiktokCatalogPending(shop);
  const accessToken = credential?.accessToken ?? pending?.accessToken ?? "";
  if (!accessToken) {
    throw new Error("请先完成 TikTok 授权");
  }

  let advertiserIds: string[] = [];
  if (credential?.advertiserId?.trim()) {
    advertiserIds = [credential.advertiserId.trim()];
  } else if (pending?.advertiserId?.trim()) {
    advertiserIds = [pending.advertiserId.trim()];
  } else {
    advertiserIds =
      pending?.accounts
        .map((a) => a.advertiserId?.trim() || a.businessId?.trim() || "")
        .filter(Boolean) ?? [];
  }
  if (advertiserIds.length === 0) {
    advertiserIds = await listAuthorizedAdvertiserIds({ accessToken });
  }
  if (advertiserIds.length === 0) {
    throw new Error("该 TikTok 账号未关联任何广告主账户");
  }

  return {
    accessToken,
    refreshToken: credential?.refreshToken ?? pending?.refreshToken,
    advertiserIds,
  };
}

function toListItem(catalog: TiktokCatalogInfo): TiktokCatalogListItem {
  const bindingMode = resolveTiktokBindingMode(catalog);
  return {
    id: catalog.catalogId,
    name: catalog.catalogName?.trim() || catalog.catalogId,
    bindingMode,
    isShopifyOfficial: catalog.isShopifyOfficial,
    bcId: catalog.bcId,
    advertiserId: catalog.advertiserId,
  };
}

/** 拉取店铺 TikTok 账号下全部 Catalog（需已授权或已连接）。 */
export async function listTiktokCatalogsForShop(shop: string): Promise<TiktokCatalogListItem[]> {
  const { accessToken, advertiserIds } = await resolveTiktokAccessToken(shop);
  const catalogs = await getTiktokCatalogsForAdvertisers({ accessToken, advertiserIds });
  const items = catalogs.map(toListItem);
  const enriched = await Promise.all(
    items.map(async (item) => {
      try {
        const conf = await fetchTiktokCatalogConf({
          accessToken,
          bcId: item.bcId,
          catalogId: item.id,
        });
        if (!conf) return item;
        return {
          ...item,
          currency: conf.currency,
          regionCode: conf.regionCode,
          channel: conf.channel,
        };
      } catch {
        return item;
      }
    }),
  );
  return enriched;
}

export type BindTiktokCatalogResult = {
  catalogId: string;
  catalogName: string;
  bindingMode: TiktokCatalogBindingMode;
  unchanged?: boolean;
};

/**
 * 绑定或切换 TikTok Catalog。
 * - 已连接：按 catalogId 切换绑定并更新 bindingMode
 * - 待选（pending）：沿用 OAuth 后首次绑定流程
 */
export async function bindTiktokCatalogForShop(
  shop: string,
  catalogId: string,
): Promise<BindTiktokCatalogResult> {
  const trimmedId = catalogId.trim();
  if (!trimmedId) {
    throw new Error("catalogId is required");
  }

  const credential = await getTiktokCatalogCredential(shop);
  if (credential) {
    const catalogs = await listTiktokCatalogsForShop(shop);
    const selected = catalogs.find((c) => c.id === trimmedId);
    if (!selected) {
      throw new Error("所选 Catalog 不在当前账号列表中，请刷新后重试");
    }
    if (selected.id === credential.catalogId) {
      return {
        catalogId: credential.catalogId,
        catalogName: credential.catalogName || credential.catalogId,
        bindingMode: credential.bindingMode,
        unchanged: true,
      };
    }
    await setTiktokCatalogCredential(shop, {
      accessToken: credential.accessToken,
      refreshToken: credential.refreshToken,
      advertiserId: selected.advertiserId,
      bcId: selected.bcId,
      catalogId: selected.id,
      catalogName: selected.name,
      bindingMode: selected.bindingMode,
    });
    return {
      catalogId: selected.id,
      catalogName: selected.name,
      bindingMode: selected.bindingMode,
    };
  }

  const pending = await getTiktokCatalogPending(shop);
  if (!pending) {
    throw new Error("未找到 TikTok 授权信息，请重新连接");
  }

  const selectedEntry = pending.accounts.find((a) => a.id === trimmedId);
  if (!selectedEntry) {
    const catalogs = await listTiktokCatalogsForShop(shop);
    const fromApi = catalogs.find((c) => c.id === trimmedId);
    if (!fromApi) {
      throw new Error("所选 Catalog 不在当前账号列表中，请刷新后重试");
    }
    await clearTiktokCatalogPending(shop);
    await setTiktokCatalogCredential(shop, {
      accessToken: pending.accessToken,
      refreshToken: pending.refreshToken,
      advertiserId: fromApi.advertiserId,
      bcId: fromApi.bcId,
      catalogId: fromApi.id,
      catalogName: fromApi.name,
      bindingMode: fromApi.bindingMode,
    });
    return {
      catalogId: fromApi.id,
      catalogName: fromApi.name,
      bindingMode: fromApi.bindingMode,
    };
  }

  const explicitAdvertiserId =
    selectedEntry?.advertiserId?.trim() ||
    pending.advertiserId?.trim() ||
    pending.accounts[0]?.advertiserId?.trim() ||
    "";
  const bcId = explicitAdvertiserId
    ? selectedEntry?.businessId?.trim() ||
      pending.bcId?.trim() ||
      pending.accounts[0]?.businessId?.trim() ||
      ""
    : "";
  const advertiserId =
    explicitAdvertiserId ||
    selectedEntry?.businessId?.trim() ||
    pending.accounts[0]?.businessId?.trim() ||
    "";

  if (!advertiserId) {
    throw new Error("无法确定所选 Catalog 的广告主 ID");
  }
  if (!bcId) {
    throw new Error("缺少 bc_id，请重新授权 TikTok 后再选择 Catalog");
  }

  const bindingMode: TiktokCatalogBindingMode =
    selectedEntry?.isShopifyOfficial === true ? "shopify_official" : "api_managed";

  await clearTiktokCatalogPending(shop);
  await setTiktokCatalogCredential(shop, {
    accessToken: pending.accessToken,
    refreshToken: pending.refreshToken,
    advertiserId,
    bcId,
    catalogId: trimmedId,
    catalogName: selectedEntry?.name,
    bindingMode,
  });

  return {
    catalogId: trimmedId,
    catalogName: selectedEntry?.name?.trim() || trimmedId,
    bindingMode,
  };
}
