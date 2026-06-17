import { appendLog, completeTask, failTask } from "../aiTask/aiTaskLogger.server";
import { buildAITaskMessage } from "../../lib/aiTaskMessage";
import { initI18n } from "../../i18n";
import { DEFAULT_LOCALE, normalizeLocale } from "../../i18n/config";
import type {
  AdsCatalogPlatform,
  AdsCatalogSyncTaskResult,
} from "../../lib/aiTaskTypes";
import type { RawShopifyProductForCatalog } from "./productFetcher.server";
import { mapShopifyToFacebook } from "./mappers/shopifyToFacebook";
import { mapShopifyToGoogle } from "./mappers/shopifyToGoogle";
import { upsertFacebookCatalogItems } from "./clients/facebookGraphClient.server";
import {
  refreshGoogleAccessToken,
  upsertGoogleMerchantProducts,
} from "./clients/googleMerchantClient.server";
import {
  getFacebookCatalogCredential,
  getGoogleMerchantCredential,
  setGoogleMerchantCredential,
} from "./credentialStore.server";

const LOG_PREFIX = "[AdsCatalog][Async]";

export interface EnqueueAdsCatalogSyncParams {
  taskId: string;
  shop: string;
  shopDomain: string;
  defaultCurrency?: string;
  brand?: string;
  locale: string;
  platform: AdsCatalogPlatform;
  products: RawShopifyProductForCatalog[];
  googleContentLanguage?: string;
  googleTargetCountry?: string;
}

export function enqueueAdsCatalogSync(params: EnqueueAdsCatalogSyncParams): void {
  void runAdsCatalogSync(params).catch((e) => {
    const detail = e instanceof Error ? e.message : String(e);
    const locale = normalizeLocale(params.locale) ?? DEFAULT_LOCALE;
    const i18n = initI18n(locale);
    const t = i18n.t.bind(i18n);
    console.error(`${LOG_PREFIX} unhandled taskId=${params.taskId} ${detail}`);
    void failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage(
        "adsCatalog.asyncUnhandled",
        t("adsCatalog.asyncUnhandled"),
      ),
      startedAt: Date.now(),
    });
  });
}

type MsgFn = (
  key: string,
  vars?: Record<string, string | number>,
) => ReturnType<typeof buildAITaskMessage>;

async function runAdsCatalogSync(params: EnqueueAdsCatalogSyncParams): Promise<void> {
  const startedAt = Date.now();
  const locale = normalizeLocale(params.locale) ?? DEFAULT_LOCALE;
  const i18n = initI18n(locale);
  const t = i18n.t.bind(i18n);
  const msg: MsgFn = (key, vars) => buildAITaskMessage(key, t(key, vars), vars);

  const { taskId, shop, platform, products } = params;
  console.info(`${LOG_PREFIX} start taskId=${taskId} shop=${shop} platform=${platform}`);

  if (products.length === 0) {
    await failTask({ taskId, startedAt, errorMsg: msg("adsCatalog.asyncNoProducts") });
    return;
  }

  await appendLog({
    taskId,
    startedAt,
    message: msg("adsCatalog.asyncProductsFetched", { count: products.length }),
  });

  if (platform === "facebook") {
    await runFacebookSync({ ...params, taskId, startedAt, msg });
  } else {
    await runGoogleSync({
      ...params,
      taskId,
      startedAt,
      contentLanguage: params.googleContentLanguage ?? "en",
      targetCountry: params.googleTargetCountry ?? "US",
      msg,
    });
  }
}

async function runFacebookSync(params: {
  taskId: string;
  startedAt: number;
  shop: string;
  shopDomain: string;
  defaultCurrency?: string;
  brand?: string;
  products: RawShopifyProductForCatalog[];
  msg: MsgFn;
}): Promise<void> {
  const credential = await getFacebookCatalogCredential(params.shop);
  if (!credential) {
    await failTask({
      taskId: params.taskId,
      startedAt: params.startedAt,
      errorMsg: params.msg("adsCatalog.asyncFacebookMissingCredential"),
    });
    return;
  }

  await appendLog({
    taskId: params.taskId,
    startedAt: params.startedAt,
    message: params.msg("adsCatalog.asyncMappingProducts"),
  });

  const errors: AdsCatalogSyncTaskResult["errors"] = [];
  const items = [];
  for (const product of params.products) {
    const mapped = mapShopifyToFacebook(product, {
      shopDomain: params.shopDomain,
      defaultCurrency: params.defaultCurrency,
      brand: params.brand,
    });
    if (mapped.ok) {
      items.push(mapped.item);
    } else {
      errors.push({ productId: mapped.productId, reason: mapped.reason });
    }
  }

  await appendLog({
    taskId: params.taskId,
    startedAt: params.startedAt,
    message: params.msg("adsCatalog.asyncPushingFacebook", { count: items.length }),
  });

  const apiResult = await upsertFacebookCatalogItems({
    accessToken: credential.accessToken,
    catalogId: credential.catalogId,
    items,
    apiVersion: credential.apiVersion,
  });
  for (const err of apiResult.errors) {
    errors.push({ productId: err.id, reason: err.reason });
  }

  const result: AdsCatalogSyncTaskResult = {
    platform: "facebook",
    totalProcessed: params.products.length,
    succeeded: apiResult.totalProcessed,
    failed: errors.length,
    errors,
  };

  await finishAdsCatalogSync({
    taskId: params.taskId,
    startedAt: params.startedAt,
    result,
    msg: params.msg,
  });
}

async function runGoogleSync(params: {
  taskId: string;
  startedAt: number;
  shop: string;
  shopDomain: string;
  defaultCurrency?: string;
  brand?: string;
  contentLanguage: string;
  targetCountry: string;
  products: RawShopifyProductForCatalog[];
  msg: MsgFn;
}): Promise<void> {
  let credential = await getGoogleMerchantCredential(params.shop);
  if (!credential) {
    await failTask({
      taskId: params.taskId,
      startedAt: params.startedAt,
      errorMsg: params.msg("adsCatalog.asyncGoogleMissingCredential"),
    });
    return;
  }

  if (credential.refreshToken && credential.clientId && credential.clientSecret) {
    const refreshed = await refreshGoogleAccessToken({
      clientId: credential.clientId,
      clientSecret: credential.clientSecret,
      refreshToken: credential.refreshToken,
    });
    if (refreshed) {
      await setGoogleMerchantCredential(params.shop, {
        accessToken: refreshed.accessToken,
        refreshToken: credential.refreshToken,
        clientId: credential.clientId,
        clientSecret: credential.clientSecret,
        merchantId: credential.merchantId,
      });
      credential = { ...credential, accessToken: refreshed.accessToken };
    }
  }

  await appendLog({
    taskId: params.taskId,
    startedAt: params.startedAt,
    message: params.msg("adsCatalog.asyncMappingProducts"),
  });

  const errors: AdsCatalogSyncTaskResult["errors"] = [];
  const products = [];
  for (const product of params.products) {
    const mapped = mapShopifyToGoogle(product, {
      shopDomain: params.shopDomain,
      contentLanguage: params.contentLanguage,
      targetCountry: params.targetCountry,
      defaultCurrency: params.defaultCurrency,
      brand: params.brand,
    });
    if (mapped.ok) {
      products.push(mapped.product);
    } else {
      errors.push({ productId: mapped.productId, reason: mapped.reason });
    }
  }

  await appendLog({
    taskId: params.taskId,
    startedAt: params.startedAt,
    message: params.msg("adsCatalog.asyncPushingGoogle", { count: products.length }),
  });

  const apiResult = await upsertGoogleMerchantProducts({
    accessToken: credential.accessToken,
    merchantId: credential.merchantId,
    products,
  });
  for (const err of apiResult.errors) {
    errors.push({ productId: err.id, reason: err.reason });
  }

  const result: AdsCatalogSyncTaskResult = {
    platform: "google",
    totalProcessed: params.products.length,
    succeeded: apiResult.totalProcessed,
    failed: errors.length,
    errors,
  };

  await finishAdsCatalogSync({
    taskId: params.taskId,
    startedAt: params.startedAt,
    result,
    msg: params.msg,
  });
}

async function finishAdsCatalogSync(params: {
  taskId: string;
  startedAt: number;
  result: AdsCatalogSyncTaskResult;
  msg: MsgFn;
}): Promise<void> {
  const payload = params.result as unknown as Record<string, unknown>;
  const finalMessage = params.msg("adsCatalog.asyncCompleted", {
    succeeded: params.result.succeeded,
    failed: params.result.failed,
  });

  if (params.result.succeeded === 0 && params.result.failed > 0) {
    const firstReason = params.result.errors[0]?.reason ?? params.msg("adsCatalog.statusFailedCopy");
    await failTask({
      taskId: params.taskId,
      startedAt: params.startedAt,
      result: payload,
      errorMsg: firstReason,
      finalMessage,
    });
    return;
  }

  await completeTask({
    taskId: params.taskId,
    startedAt: params.startedAt,
    result: payload,
    finalMessage,
  });
}
