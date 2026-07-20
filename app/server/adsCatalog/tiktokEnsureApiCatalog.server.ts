import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import {
  createTiktokCatalog,
  createTiktokPixel,
  bindTiktokCatalogEventSource,
  fetchTiktokCatalogConf,
  isApiWritableTiktokCatalog,
  resolveTiktokCatalogRegion,
} from "./clients/tiktokCatalogClient.server";
import {
  clearTiktokCatalogPending,
  getTiktokCatalogCredential,
  getTiktokCatalogPending,
  setTiktokCatalogCredential,
} from "./credentialStore.server";
import { listAccessibleBcIds } from "./tiktokOAuth.server";
import { fetchShopBasicInfo } from "../shopify/fetchShopBasicInfo.server";

const LOG_PREFIX = "[AdsCatalog][TikTokEnsure]";

export type EnsureTiktokApiCatalogResult = {
  catalogId: string;
  catalogName: string;
  created: boolean;
  bindingMode: "api_managed";
  /** Spark 自动创建并与 Catalog 关联的 TikTok Pixel Code。 */
  pixelCode?: string;
};

/**
 * 确保店铺绑定的是 Spark API 可写 Catalog（Path B）。
 * - 已是 api_managed 且 catalog/get 明确返回 channel=CLIENT：复用当前目录
 * - 否则（含 channel 缺失 / 非 CLIENT / 官方目录）：新建 Spark Catalog 并切换 bindingMode
 *
 * 创建新 Catalog 时会同步：
 * 1. 创建配对的 TikTok Pixel 并绑定为 Web 事件源（用于转化追踪）
 * 2. 若提供 appId，同时绑定应用事件源（用于 App 内事件再营销）
 */
export async function ensureTiktokApiManagedCatalog(params: {
  shop: string;
  admin: ShopifyAdminGraphqlClient;
  /** 商家 App ID，用于绑定应用事件源（可选）。 */
  appId?: string;
}): Promise<EnsureTiktokApiCatalogResult> {
  console.info(`${LOG_PREFIX} step=ensure_start shop=${params.shop}`);
  const shopInfo = await fetchShopBasicInfo(params.admin);
  const expectedRegion = resolveTiktokCatalogRegion(
    shopInfo?.currencyCode,
    shopInfo?.countryCode,
  ).regionCode;

  const credential = await getTiktokCatalogCredential(params.shop);
  if (credential?.bindingMode === "api_managed" && credential.catalogId) {
    const accessToken = credential.accessToken.trim();
    const bcId = credential.bcId?.trim() ?? "";
    if (accessToken && bcId) {
      const conf = await fetchTiktokCatalogConf({
        accessToken,
        bcId,
        catalogId: credential.catalogId,
      });
      const regionOk = !conf?.regionCode || conf.regionCode === expectedRegion;
      if (conf && isApiWritableTiktokCatalog(conf) && regionOk) {
        console.info(
          `${LOG_PREFIX} step=ensure_reuse shop=${params.shop} catalogId=${credential.catalogId} catalogName=${credential.catalogName ?? ""} channel=${conf.channel ?? ""} region=${conf.regionCode ?? ""} expectedRegion=${expectedRegion}`,
        );

        // 如果传入了新的 appId 且与已存储的不同，补充绑定应用事件源（best-effort）。
        if (params.appId && params.appId.trim() !== (credential.appId ?? "")) {
          await bindCatalogEventSourcesBestEffort({
            accessToken,
            advertiserId: credential.advertiserId,
            bcId,
            catalogId: credential.catalogId,
            appId: params.appId.trim(),
            shop: params.shop,
            catalogName: credential.catalogName,
          });
          await setTiktokCatalogCredential(params.shop, {
            accessToken: credential.accessToken,
            refreshToken: credential.refreshToken,
            advertiserId: credential.advertiserId,
            bcId: credential.bcId,
            catalogId: credential.catalogId,
            catalogName: credential.catalogName,
            pixelCode: credential.pixelCode,
            appId: params.appId.trim(),
          });
        }

        return {
          catalogId: credential.catalogId,
          catalogName: credential.catalogName || credential.catalogId,
          created: false,
          bindingMode: "api_managed",
          pixelCode: credential.pixelCode,
        };
      }
      console.info(
        `${LOG_PREFIX} step=ensure_force_recreate shop=${params.shop} catalogId=${credential.catalogId} channel=${conf?.channel ?? ""} region=${conf?.regionCode ?? ""} expectedRegion=${expectedRegion} isShopifyOfficial=${conf?.isShopifyOfficial ?? false} confFound=${Boolean(conf)}`,
      );
    } else {
      console.info(
        `${LOG_PREFIX} step=ensure_force_recreate shop=${params.shop} catalogId=${credential.catalogId} reason=missing_bc_or_token`,
      );
    }
  }

  const pending = await getTiktokCatalogPending(params.shop);
  const accessToken = credential?.accessToken || pending?.accessToken || "";
  const refreshToken = credential?.refreshToken || pending?.refreshToken;
  const advertiserId =
    credential?.advertiserId?.trim() ||
    pending?.advertiserId?.trim() ||
    pending?.accounts.find((a) => a.advertiserId?.trim())?.advertiserId?.trim() ||
    "";

  if (!accessToken) {
    throw new Error("请先完成 TikTok 授权后再使用 API 上传同步。");
  }
  if (!advertiserId) {
    throw new Error("缺少 advertiserId，请重新授权 TikTok。");
  }

  let bcId =
    credential?.bcId?.trim() ||
    pending?.bcId?.trim() ||
    pending?.accounts.find((a) => a.businessId?.trim())?.businessId?.trim() ||
    "";
  if (!bcId) {
    const bcIds = await listAccessibleBcIds({ accessToken });
    bcId = bcIds[0] ?? "";
  }
  if (!bcId) {
    throw new Error("缺少 bc_id，请重新授权 TikTok。");
  }

  const shopLabel = (shopInfo?.name || params.shop.split(".")[0] || "Store").slice(0, 40);
  console.info(
    `${LOG_PREFIX} step=ensure_create shop=${params.shop} bcId=${bcId} advertiserId=${advertiserId} currency=${shopInfo?.currencyCode ?? ""} country=${shopInfo?.countryCode ?? ""} region=${expectedRegion} name=${JSON.stringify(`Spark Catalog — ${shopLabel}`)}`,
  );
  const created = await createTiktokCatalog({
    accessToken,
    bcId,
    name: `Spark Catalog — ${shopLabel}`,
    currency: shopInfo?.currencyCode,
    countryCode: shopInfo?.countryCode,
  });

  // 创建配对 Pixel 并绑定事件源（best-effort：失败不阻断 Catalog 创建流程）。
  let pixelCode: string | undefined;
  try {
    const pixel = await createTiktokPixel({
      accessToken,
      advertiserId,
      pixelName: `Spark Pixel — ${shopLabel}`,
    });
    pixelCode = pixel.pixelCode;
    console.info(
      `${LOG_PREFIX} step=pixel_created shop=${params.shop} pixelCode=${pixelCode}`,
    );
  } catch (e) {
    console.warn(
      `${LOG_PREFIX} step=pixel_create_failed shop=${params.shop} err=${e instanceof Error ? e.message : String(e)}`,
    );
  }

  await bindCatalogEventSourcesBestEffort({
    accessToken,
    advertiserId,
    bcId,
    catalogId: created.catalogId,
    pixelCode,
    appId: params.appId?.trim(),
    shop: params.shop,
    catalogName: created.catalogName,
  });

  if (pending) {
    await clearTiktokCatalogPending(params.shop);
  }
  await setTiktokCatalogCredential(params.shop, {
    accessToken,
    refreshToken,
    advertiserId,
    bcId,
    catalogId: created.catalogId,
    catalogName: created.catalogName,
    bindingMode: "api_managed",
    pixelCode,
    appId: params.appId?.trim(),
  });

  console.info(
    `${LOG_PREFIX} step=ensure_created shop=${params.shop} catalogId=${created.catalogId} catalogName=${created.catalogName} pixelCode=${pixelCode ?? ""} appId=${params.appId ?? ""}`,
  );
  return {
    catalogId: created.catalogId,
    catalogName: created.catalogName,
    created: true,
    bindingMode: "api_managed",
    pixelCode,
  };
}

/**
 * best-effort 绑定事件源：失败只记日志，不抛异常。
 * Pixel 和 App 事件源分开调用（TikTok API 每次只接受一个 event source）。
 */
async function bindCatalogEventSourcesBestEffort(params: {
  accessToken: string;
  advertiserId: string;
  bcId: string;
  catalogId: string;
  pixelCode?: string;
  appId?: string;
  shop: string;
  catalogName?: string;
}): Promise<void> {
  if (params.pixelCode) {
    try {
      await bindTiktokCatalogEventSource({
        accessToken: params.accessToken,
        advertiserId: params.advertiserId,
        bcId: params.bcId,
        catalogId: params.catalogId,
        pixelCode: params.pixelCode,
      });
      console.info(
        `${LOG_PREFIX} step=eventsource_pixel_bound shop=${params.shop} catalogId=${params.catalogId} pixelCode=${params.pixelCode}`,
      );
    } catch (e) {
      console.warn(
        `${LOG_PREFIX} step=eventsource_pixel_bind_failed shop=${params.shop} catalogId=${params.catalogId} pixelCode=${params.pixelCode} err=${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  if (params.appId) {
    try {
      await bindTiktokCatalogEventSource({
        accessToken: params.accessToken,
        advertiserId: params.advertiserId,
        bcId: params.bcId,
        catalogId: params.catalogId,
        appId: params.appId,
      });
      console.info(
        `${LOG_PREFIX} step=eventsource_app_bound shop=${params.shop} catalogId=${params.catalogId} appId=${params.appId}`,
      );
    } catch (e) {
      console.warn(
        `${LOG_PREFIX} step=eventsource_app_bind_failed shop=${params.shop} catalogId=${params.catalogId} appId=${params.appId} err=${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
