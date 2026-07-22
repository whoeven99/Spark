import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import { fetchShopBasicInfo } from "../shopify/fetchShopBasicInfo.server";
import {
  fetchTiktokCatalogConf,
  formatTiktokCatalogDiagnostics,
  getTiktokBcPixelLinkedAdvertiserIds,
  getTiktokCatalogEventSourceBindings,
  isApiWritableTiktokCatalog,
  resolveTiktokCatalogRegion,
  validateTiktokCatalogForApiUpload,
} from "./clients/tiktokCatalogClient.server";
import { getTiktokCatalogCredential } from "./credentialStore.server";

const LOG_PREFIX = "[AdsCatalog][BindDiagnosis]";

export type TiktokBindDiagnosisStatus = "ok" | "warn" | "error";

export type TiktokBindDiagnosisCheck = {
  id: string;
  status: TiktokBindDiagnosisStatus;
  vars?: Record<string, string>;
};

export type TiktokBindDiagnosisResult = {
  ready: boolean;
  summaryStatus: TiktokBindDiagnosisStatus;
  checks: TiktokBindDiagnosisCheck[];
  catalogDiagnostics?: string;
};

function pushCheck(
  checks: TiktokBindDiagnosisCheck[],
  check: TiktokBindDiagnosisCheck,
): void {
  checks.push(check);
}

function summarizeStatus(checks: TiktokBindDiagnosisCheck[]): TiktokBindDiagnosisStatus {
  if (checks.some((c) => c.status === "error")) return "error";
  if (checks.some((c) => c.status === "warn")) return "warn";
  return "ok";
}

function isReadyForApiBind(checks: TiktokBindDiagnosisCheck[]): boolean {
  const blocking = new Set([
    "connected",
    "bc_id",
    "catalog_found",
    "api_writable",
    "currency_match",
    "pixel_present",
    "events_api_token",
    "pixel_adv_link",
    "pixel_adv_link_permission",
    "catalog_eventsource",
    "catalog_adv_link",
  ]);
  return !checks.some((c) => c.status === "error" && blocking.has(c.id));
}

/**
 * 只读诊断：检查 TikTok Catalog + Pixel 事件源绑定就绪情况，不修改 TikTok 侧状态。
 */
export async function diagnoseTiktokCatalogBind(params: {
  shop: string;
  admin: ShopifyAdminGraphqlClient;
}): Promise<TiktokBindDiagnosisResult> {
  const checks: TiktokBindDiagnosisCheck[] = [];
  const credential = await getTiktokCatalogCredential(params.shop);

  if (!credential) {
    pushCheck(checks, { id: "connected", status: "error" });
    return {
      ready: false,
      summaryStatus: "error",
      checks,
    };
  }
  pushCheck(checks, { id: "connected", status: "ok" });

  const bcId = credential.bcId?.trim() ?? "";
  const advertiserId = credential.advertiserId?.trim() ?? "";
  const catalogId = credential.catalogId?.trim() ?? "";
  const pixelCode = credential.pixelCode?.trim() ?? "";

  if (!bcId) {
    pushCheck(checks, { id: "bc_id", status: "error" });
  } else {
    pushCheck(checks, { id: "bc_id", status: "ok", vars: { bcId } });
  }

  if (!advertiserId) {
    pushCheck(checks, { id: "advertiser_id", status: "error" });
  } else {
    pushCheck(checks, { id: "advertiser_id", status: "ok", vars: { advertiserId } });
  }

  if (!catalogId) {
    pushCheck(checks, { id: "catalog_found", status: "error" });
    return {
      ready: false,
      summaryStatus: summarizeStatus(checks),
      checks,
    };
  }

  if (!bcId || !credential.accessToken?.trim()) {
    return {
      ready: false,
      summaryStatus: summarizeStatus(checks),
      checks,
    };
  }

  const shopInfo = await fetchShopBasicInfo(params.admin);
  const expectedRegion = resolveTiktokCatalogRegion(
    shopInfo?.currencyCode,
    shopInfo?.countryCode,
  ).regionCode;

  const conf = await fetchTiktokCatalogConf({
    accessToken: credential.accessToken,
    bcId,
    catalogId,
  });

  if (!conf) {
    pushCheck(checks, {
      id: "catalog_found",
      status: "error",
      vars: { catalogId },
    });
    return {
      ready: false,
      summaryStatus: summarizeStatus(checks),
      checks,
    };
  }

  pushCheck(checks, {
    id: "catalog_found",
    status: "ok",
    vars: {
      catalogId,
      name: conf.catalogName ?? catalogId,
    },
  });

  const catalogDiagnostics = formatTiktokCatalogDiagnostics(conf);

  if (conf.isShopifyOfficial) {
    pushCheck(checks, { id: "api_writable", status: "error", vars: { channel: "SHOPIFY" } });
  } else if (!isApiWritableTiktokCatalog(conf)) {
    pushCheck(checks, {
      id: "api_writable",
      status: "error",
      vars: { channel: conf.channel ?? "" },
    });
  } else {
    pushCheck(checks, { id: "api_writable", status: "ok", vars: { channel: conf.channel ?? "CLIENT" } });
  }

  const uploadBlockReason = validateTiktokCatalogForApiUpload(conf, shopInfo?.currencyCode);
  if (uploadBlockReason?.includes("币种")) {
    pushCheck(checks, {
      id: "currency_match",
      status: "error",
      vars: {
        catalogCurrency: conf.currency ?? "",
        shopCurrency: shopInfo?.currencyCode ?? "",
      },
    });
  } else if (conf.currency && shopInfo?.currencyCode) {
    pushCheck(checks, {
      id: "currency_match",
      status: "ok",
      vars: {
        catalogCurrency: conf.currency,
        shopCurrency: shopInfo.currencyCode,
      },
    });
  } else {
    pushCheck(checks, { id: "currency_match", status: "warn" });
  }

  if (conf.regionCode && conf.regionCode !== expectedRegion) {
    pushCheck(checks, {
      id: "region_match",
      status: "warn",
      vars: {
        catalogRegion: conf.regionCode,
        expectedRegion,
      },
    });
  } else if (conf.regionCode) {
    pushCheck(checks, {
      id: "region_match",
      status: "ok",
      vars: { catalogRegion: conf.regionCode },
    });
  }

  const linkedAdvertiserIds = conf.linkedAdvertiserIds ?? [];
  if (linkedAdvertiserIds.length === 0) {
    pushCheck(checks, {
      id: "catalog_adv_link_unknown",
      status: "warn",
      vars: { advertiserId },
    });
  } else if (!linkedAdvertiserIds.includes(advertiserId)) {
    pushCheck(checks, {
      id: "catalog_adv_link",
      status: "error",
      vars: {
        advertiserId,
        linkedAdvertiserIds: linkedAdvertiserIds.join(", "),
      },
    });
  } else {
    pushCheck(checks, {
      id: "catalog_adv_link",
      status: "ok",
      vars: { advertiserId },
    });
  }

  if (!pixelCode) {
    pushCheck(checks, { id: "pixel_present", status: "error" });
    if (!credential.eventsApiAccessToken?.trim()) {
      pushCheck(checks, { id: "events_api_token", status: "error" });
    } else {
      pushCheck(checks, { id: "events_api_token", status: "ok" });
    }
  } else {
    pushCheck(checks, { id: "pixel_present", status: "ok", vars: { pixelCode } });

    if (!credential.eventsApiAccessToken?.trim()) {
      pushCheck(checks, { id: "events_api_token", status: "error" });
    } else {
      pushCheck(checks, { id: "events_api_token", status: "ok" });
    }

    const linkedResult = await getTiktokBcPixelLinkedAdvertiserIds({
      accessToken: credential.accessToken,
      bcId,
      pixelCode,
    });

    if (!linkedResult.ok) {
      pushCheck(checks, {
        id: "pixel_adv_link_permission",
        status: "error",
        vars: {
          pixelCode,
          advertiserId,
          message: linkedResult.message ?? linkedResult.errorCode ?? "unknown",
        },
      });
    } else if (linkedResult.advertiserIds.length === 0) {
      pushCheck(checks, {
        id: "pixel_adv_link",
        status: "error",
        vars: { pixelCode, advertiserId, linkedAdvertiserIds: "—" },
      });
    } else if (!linkedResult.advertiserIds.includes(advertiserId)) {
      pushCheck(checks, {
        id: "pixel_adv_link",
        status: "error",
        vars: {
          pixelCode,
          advertiserId,
          linkedAdvertiserIds: linkedResult.advertiserIds.join(", "),
        },
      });
    } else {
      pushCheck(checks, {
        id: "pixel_adv_link",
        status: "ok",
        vars: { pixelCode, advertiserId },
      });
    }

    const eventSources = await getTiktokCatalogEventSourceBindings({
      accessToken: credential.accessToken,
      bcId,
      catalogId,
    });
    const boundPixel = eventSources.find((item) => item.pixelCode === pixelCode);
    if (boundPixel) {
      pushCheck(checks, {
        id: "catalog_eventsource",
        status: "ok",
        vars: { pixelCode },
      });
    } else if (eventSources.some((item) => item.pixelCode)) {
      pushCheck(checks, {
        id: "catalog_eventsource",
        status: "warn",
        vars: {
          pixelCode,
          boundPixelCode: eventSources.find((item) => item.pixelCode)?.pixelCode ?? "",
        },
      });
    } else {
      pushCheck(checks, {
        id: "catalog_eventsource",
        status: "error",
        vars: { pixelCode },
      });
    }
  }

  const summaryStatus = summarizeStatus(checks);
  const ready = isReadyForApiBind(checks);

  console.info(
    `${LOG_PREFIX} shop=${params.shop} ready=${ready} summary=${summaryStatus} catalogId=${catalogId} pixelCode=${pixelCode || ""} diagnostics=${catalogDiagnostics}`,
  );

  return {
    ready,
    summaryStatus,
    checks,
    catalogDiagnostics,
  };
}
