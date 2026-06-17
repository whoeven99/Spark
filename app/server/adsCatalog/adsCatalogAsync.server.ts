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
import { mapShopifyVariantsToGoogle } from "./mappers/shopifyToGoogle";
import {
  validateProductsForGoogle,
  collectErrorProductIds,
} from "./validators/googleProductValidator";
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
import {
  checkGmcProductStatuses,
  scheduleGmcStatusCheck,
} from "./gmcStatusChecker.server";

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
  googleProductCategory?: string;
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
      googleProductCategory: params.googleProductCategory,
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
  googleProductCategory?: string;
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

  // Attach the全店统一 Google 类目 so the validator/mapper see it consistently.
  const enrichedProducts = params.products.map((p) => ({
    ...p,
    googleProductCategory: params.googleProductCategory ?? p.googleProductCategory ?? null,
  }));

  // 同步前再次校验，跳过硬性错误商品。
  const report = validateProductsForGoogle(enrichedProducts);
  const errorIds = collectErrorProductIds(report);
  const errors: AdsCatalogSyncTaskResult["errors"] = [];
  for (const result of report.products) {
    if (result.status === "error") {
      const reason = result.issues.find((i) => i.level === "error")?.message ?? "validation error";
      errors.push({ productId: result.productId, reason });
    }
  }

  await appendLog({
    taskId: params.taskId,
    startedAt: params.startedAt,
    message: params.msg("adsCatalog.asyncMappingProducts"),
  });

  const products = [];
  for (const product of enrichedProducts) {
    if (errorIds.has(product.id)) continue;
    const mapped = mapShopifyVariantsToGoogle(product, {
      shopDomain: params.shopDomain,
      contentLanguage: params.contentLanguage,
      targetCountry: params.targetCountry,
      defaultCurrency: params.defaultCurrency,
      brand: params.brand,
      googleProductCategory: params.googleProductCategory,
    });
    if (mapped.ok) {
      products.push(...mapped.products);
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
    totalProcessed: products.length,
    succeeded: apiResult.totalProcessed,
    failed: errors.length,
    skippedByValidation: errorIds.size,
    errors,
  };

  // 同步完成后立即查一次 GMC 审核状态（best-effort，不阻断任务结果）。
  if (apiResult.totalProcessed > 0) {
    try {
      const review = await checkGmcProductStatuses({
        shop: params.shop,
        merchantId: credential.merchantId,
        accessToken: credential.accessToken,
      });
      result.gmcReview = {
        checked: review.checked,
        approved: review.approved,
        disapproved: review.disapproved,
        pending: review.pending,
        accountSuspended: review.accountSuspended,
        checkedAt: new Date().toISOString(),
        products: review.products.slice(0, 250).map((p) => ({
          offerId: p.offerId,
          title: p.title,
          status: p.status,
          issues: p.issues.map((i) => ({
            code: i.code,
            servability: i.servability,
            description: i.description,
          })),
        })),
      };
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.error(`${LOG_PREFIX} immediate GMC status check failed taskId=${params.taskId} ${detail}`);
    }
    // 30 分钟后再查一次（进程内延迟任务）。
    scheduleGmcStatusCheck({ shop: params.shop, delayMs: 30 * 60 * 1000 });
  }

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
