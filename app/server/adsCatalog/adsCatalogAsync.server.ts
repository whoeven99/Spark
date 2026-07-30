import { appendLog, completeTask, failTask, updateTaskProgress } from "../aiTask/aiTaskLogger.server";
import { buildAITaskMessage } from "../../lib/aiTaskMessage";
import { initI18n } from "../../i18n";
import { DEFAULT_LOCALE, normalizeLocale } from "../../i18n/config";
import type {
  AdsCatalogPlatform,
  AdsCatalogSyncTaskResult,
  TiktokCatalogProductResult,
} from "../../lib/aiTaskTypes";
import type { RawShopifyProductForCatalog } from "./productFetcher.server";
import { mapShopifyToFacebook } from "./mappers/shopifyToFacebook";
import { mapShopifyVariantsToGoogle } from "./mappers/shopifyToGoogle";
import { mapShopifyToTiktok } from "./mappers/shopifyToTiktok";
import {
  buildTiktokFeedCsv,
  mapShopifyToTiktokFeedCsv,
  type TiktokFeedCsvRow,
} from "./mappers/shopifyToTiktokFeedCsv";
import { uploadTiktokFeedCsvAndGetUrl } from "./adsCatalogBlob.server";
import {
  validateProductsForGoogle,
  collectErrorProductIds,
} from "./validators/googleProductValidator";
import { upsertFacebookCatalogItems } from "./clients/facebookGraphClient.server";
import {
  ensureGoogleMerchantDataSource,
  refreshGoogleAccessToken,
  upsertGoogleMerchantProducts,
} from "./clients/googleMerchantClient.server";
import {
  fetchTiktokCatalogConf,
  uploadTiktokCatalogProductFile,
  upsertTiktokCatalogItems,
  validateTiktokCatalogForApiUpload,
} from "./clients/tiktokCatalogClient.server";
import { confirmTiktokCatalogUpload, buildTiktokProductResults, buildTiktokProgressProductResults } from "./clients/tiktokCatalogUploadConfirm.server";
import {
  getFacebookCatalogCredential,
  getGoogleMerchantCredential,
  getTiktokCatalogCredential,
  setGoogleMerchantCredential,
  setTiktokCatalogCredential,
} from "./credentialStore.server";
import { isShopifySyncedCatalogUploadError } from "./tiktokOAuth.server";
import {
  checkGmcProductStatuses,
  scheduleGmcStatusCheck,
} from "./gmcStatusChecker.server";
import {
  checkMetaCatalogStatuses,
  scheduleMetaCatalogStatusCheck,
} from "./metaCatalogStatusChecker.server";

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
  /** TikTok：默认 product_upload（JSON）；product_file = CSV Feed 文件上传。 */
  tiktokUploadMethod?: "product_upload" | "product_file";
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

function summarizeTiktokProductResults(productResults: TiktokCatalogProductResult[]): {
  succeeded: number;
  failed: number;
} {
  let succeeded = 0;
  let failed = 0;
  for (const row of productResults) {
    if (row.status === "failed") failed += 1;
    else if (row.status === "success" || row.status === "warning") succeeded += 1;
  }
  return { succeeded, failed };
}

async function persistTiktokSyncProgress(params: {
  taskId: string;
  catalogId: string;
  totalProcessed: number;
  uploadMethod?: "product_upload" | "product_file";
  mappingErrors: AdsCatalogSyncTaskResult["errors"];
  expectedSkuIds: string[];
  uploadErrors?: Array<{ id: string; reason: string }>;
  feedLogId?: string;
  feedLogStatus?: string;
}): Promise<void> {
  const productResults = buildTiktokProgressProductResults({
    mappingErrors: params.mappingErrors,
    expectedSkuIds: params.expectedSkuIds,
    uploadErrors: params.uploadErrors,
  });
  const summary = summarizeTiktokProductResults(productResults);
  const errors = [
    ...params.mappingErrors,
    ...(params.uploadErrors ?? []).map((entry) => ({
      productId: entry.id,
      reason: entry.reason,
    })),
  ];
  await updateTaskProgress({
    taskId: params.taskId,
    result: {
      platform: "tiktok",
      syncMode: "api_managed",
      totalProcessed: params.totalProcessed,
      succeeded: summary.succeeded,
      failed: summary.failed,
      errors,
      productResults,
      catalogId: params.catalogId,
      ...(params.uploadMethod ? { uploadMethod: params.uploadMethod } : {}),
      ...(params.feedLogId ? { feedLogId: params.feedLogId } : {}),
      ...(params.feedLogStatus ? { feedLogStatus: params.feedLogStatus } : {}),
    },
  });
}

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
  } else if (platform === "tiktok") {
    await runTiktokSync({
      ...params,
      taskId,
      startedAt,
      msg,
      googleProductCategory: params.googleProductCategory,
    });
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

  // 同步完成后立即查一次 Meta Catalog 审核状态（best-effort，不阻断任务结果）。
  if (apiResult.totalProcessed > 0) {
    try {
      const review = await checkMetaCatalogStatuses({
        shop: params.shop,
        catalogId: credential.catalogId,
        accessToken: credential.accessToken,
      });
      result.metaReview = {
        checked: review.checked,
        approved: review.approved,
        disapproved: review.disapproved,
        pending: review.pending,
        accountRestricted: review.accountRestricted,
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
      console.error(
        `${LOG_PREFIX} immediate Meta status check failed taskId=${params.taskId} ${detail}`,
      );
    }
    // 30 分钟后再查一次（进程内延迟任务）。
    scheduleMetaCatalogStatusCheck({ shop: params.shop, delayMs: 30 * 60 * 1000 });
  }

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

  const feedLabel = params.targetCountry.trim().toUpperCase();
  const contentLanguage = params.contentLanguage.trim().toLowerCase();
  const dataSource = await ensureGoogleMerchantDataSource({
    accessToken: credential.accessToken,
    merchantId: credential.merchantId,
    contentLanguage,
    feedLabel,
    preferredName: credential.dataSourceName,
  });
  if (!dataSource.name) {
    throw new Error("Merchant API data source response returned no resource name");
  }
  await setGoogleMerchantCredential(params.shop, {
    accessToken: credential.accessToken,
    refreshToken: credential.refreshToken,
    clientId: credential.clientId,
    clientSecret: credential.clientSecret,
    merchantId: credential.merchantId,
    dataSourceName: dataSource.name,
    dataSourceContentLanguage: contentLanguage,
    dataSourceFeedLabel: feedLabel,
  });

  const apiResult = await upsertGoogleMerchantProducts({
    accessToken: credential.accessToken,
    merchantId: credential.merchantId,
    dataSourceName: dataSource.name,
    feedLabel,
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

async function runTiktokSync(params: {
  taskId: string;
  startedAt: number;
  shop: string;
  shopDomain: string;
  defaultCurrency?: string;
  brand?: string;
  products: RawShopifyProductForCatalog[];
  googleProductCategory?: string;
  tiktokUploadMethod?: "product_upload" | "product_file";
  msg: MsgFn;
}): Promise<void> {
  const uploadMethod = params.tiktokUploadMethod ?? "product_upload";
  const logTiktok = (step: string, detail = "") => {
    console.info(
      `${LOG_PREFIX}[TikTok] taskId=${params.taskId} shop=${params.shop} step=${step}${detail ? ` ${detail}` : ""}`,
    );
  };

  logTiktok(
    "start",
    `productCount=${params.products.length} shopDomain=${params.shopDomain} currency=${params.defaultCurrency ?? ""} uploadMethod=${uploadMethod}`,
  );

  const credential = await getTiktokCatalogCredential(params.shop);
  if (!credential) {
    logTiktok("credential_missing");
    await failTask({
      taskId: params.taskId,
      startedAt: params.startedAt,
      errorMsg: params.msg("adsCatalog.asyncTiktokMissingCredential"),
    });
    return;
  }
  if (!credential.bcId) {
    logTiktok("bc_id_missing", `advertiserId=${credential.advertiserId} catalogId=${credential.catalogId}`);
    await failTask({
      taskId: params.taskId,
      startedAt: params.startedAt,
      errorMsg: params.msg("adsCatalog.asyncTiktokMissingBcId"),
    });
    return;
  }

  logTiktok(
    "credential_loaded",
    `bindingMode=${credential.bindingMode} bcId=${credential.bcId} advertiserId=${credential.advertiserId} catalogId=${credential.catalogId} catalogName=${credential.catalogName ?? ""}`,
  );

  const catalogConf = await fetchTiktokCatalogConf({
    accessToken: credential.accessToken,
    bcId: credential.bcId,
    catalogId: credential.catalogId,
  });
  if (catalogConf) {
    logTiktok("catalog_conf", JSON.stringify(catalogConf));
    const sampleCurrency =
      params.products.find((p) => p.priceCurrency)?.priceCurrency ?? params.defaultCurrency;
    const validationError = validateTiktokCatalogForApiUpload(catalogConf, sampleCurrency);
    if (
      validationError &&
      credential.bindingMode === "api_managed" &&
      uploadMethod !== "product_file"
    ) {
      logTiktok("catalog_conf_invalid", validationError);
      await failTask({
        taskId: params.taskId,
        startedAt: params.startedAt,
        errorMsg: validationError,
      });
      return;
    }
  } else {
    logTiktok("catalog_conf_missing", `catalogId=${credential.catalogId}`);
  }

  const enrichedProducts = params.products.map((p) => ({
    ...p,
    googleProductCategory: params.googleProductCategory ?? p.googleProductCategory ?? null,
  }));

  await appendLog({
    taskId: params.taskId,
    startedAt: params.startedAt,
    message: params.msg("adsCatalog.asyncMappingProducts"),
  });

  const mappingErrors: AdsCatalogSyncTaskResult["errors"] = [];
  const items = [];
  for (const product of enrichedProducts) {
    const mapped = mapShopifyToTiktok(product, {
      shopDomain: params.shopDomain,
      defaultCurrency: params.defaultCurrency,
      brand: params.brand,
    });
    if (mapped.ok) {
      items.push(mapped.item);
      logTiktok(
        "map_ok",
        `productId=${product.id} sku=${mapped.item.sku_id} title=${JSON.stringify(mapped.item.title.slice(0, 80))} currency=${mapped.item.price_info.currency} price=${mapped.item.price_info.price} availability=${mapped.item.availability}`,
      );
    } else {
      mappingErrors.push({ productId: mapped.productId, reason: mapped.reason });
      console.warn(
        `${LOG_PREFIX}[TikTok] taskId=${params.taskId} step=map_skip productId=${mapped.productId} reason=${mapped.reason}`,
      );
    }
  }

  logTiktok(
    "map_done",
    `mapped=${items.length} skipped=${mappingErrors.length} sampleSkus=${items
      .slice(0, 5)
      .map((i) => i.sku_id)
      .join(",")}`,
  );

  const expectedSkuIds = items.map((item) => item.sku_id);
  if (credential.bindingMode !== "shopify_official") {
    await persistTiktokSyncProgress({
      taskId: params.taskId,
      catalogId: credential.catalogId,
      totalProcessed: enrichedProducts.length,
      uploadMethod,
      mappingErrors,
      expectedSkuIds,
    });
  }

  // Feed 文件同步（CSV product/file）。
  if (uploadMethod === "product_file") {
    await runTiktokFeedFileSync({
      taskId: params.taskId,
      startedAt: params.startedAt,
      shop: params.shop,
      shopDomain: params.shopDomain,
      defaultCurrency: params.defaultCurrency,
      brand: params.brand,
      products: enrichedProducts,
      credential: {
        accessToken: credential.accessToken,
        refreshToken: credential.refreshToken,
        advertiserId: credential.advertiserId,
        bcId: credential.bcId,
        catalogId: credential.catalogId,
        catalogName: credential.catalogName,
      },
      msg: params.msg,
      logTiktok,
    });
    return;
  }

  // Path A：官方 Shopify↔TikTok Catalog — 仅校验映射，不 API 上传。
  if (credential.bindingMode === "shopify_official") {
    logTiktok("path_a_official_validate_only", `readyCount=${items.length}`);
    await appendLog({
      taskId: params.taskId,
      startedAt: params.startedAt,
      message: params.msg("adsCatalog.asyncTiktokOfficialSync", { count: items.length }),
    });
    const result: AdsCatalogSyncTaskResult = {
      platform: "tiktok",
      totalProcessed: enrichedProducts.length,
      succeeded: items.length,
      failed: mappingErrors.length,
      errors: mappingErrors,
      syncMode: "shopify_official",
    };
    await finishAdsCatalogSync({
      taskId: params.taskId,
      startedAt: params.startedAt,
      result,
      msg: params.msg,
    });
    return;
  }

  // Path B：API 可写 Catalog — JSON product/upload。
  logTiktok("path_b_api_upload", `itemCount=${items.length} catalogId=${credential.catalogId}`);
  await appendLog({
    taskId: params.taskId,
    startedAt: params.startedAt,
    message: params.msg("adsCatalog.asyncPushingTiktok", { count: items.length }),
  });

  const apiResult = await upsertTiktokCatalogItems({
    accessToken: credential.accessToken,
    advertiserId: credential.advertiserId,
    bcId: credential.bcId,
    catalogId: credential.catalogId,
    items,
  });

  logTiktok(
    "upload_result",
    `requested=${apiResult.totalRequested} accepted=${apiResult.totalProcessed} errors=${apiResult.errors.length} feedLogId=${apiResult.feedLogId ?? ""}`,
  );
  if (apiResult.errors.length > 0) {
    console.warn(
      `${LOG_PREFIX}[TikTok] taskId=${params.taskId} step=upload_errors ${JSON.stringify(apiResult.errors.slice(0, 20))}`,
    );
  }

  const shopifyLocked = apiResult.errors.some((err) =>
    isShopifySyncedCatalogUploadError(err.reason),
  );

  // 运行时发现官方锁定目录：升级为 shopify_official，按 Path A 语义收尾。
  if (shopifyLocked) {
    logTiktok("shopify_lock_detected_switch_official", `catalogId=${credential.catalogId}`);
    await setTiktokCatalogCredential(params.shop, {
      accessToken: credential.accessToken,
      refreshToken: credential.refreshToken,
      advertiserId: credential.advertiserId,
      bcId: credential.bcId,
      catalogId: credential.catalogId,
      catalogName: credential.catalogName,
      bindingMode: "shopify_official",
    });
    await appendLog({
      taskId: params.taskId,
      startedAt: params.startedAt,
      message: params.msg("adsCatalog.asyncTiktokSwitchedToOfficial"),
    });
    const result: AdsCatalogSyncTaskResult = {
      platform: "tiktok",
      totalProcessed: params.products.length,
      succeeded: items.length,
      failed: mappingErrors.length,
      errors: mappingErrors,
      syncMode: "shopify_official",
      catalogId: credential.catalogId,
    };
    await finishAdsCatalogSync({
      taskId: params.taskId,
      startedAt: params.startedAt,
      result,
      msg: params.msg,
    });
    return;
  }

  const errors = [...mappingErrors];
  for (const err of apiResult.errors) {
    errors.push({ productId: err.id, reason: err.reason });
  }

  const acceptedSkuIds = items
    .map((item) => item.sku_id)
    .filter((skuId) => !apiResult.errors.some((err) => err.id === skuId));

  await persistTiktokSyncProgress({
    taskId: params.taskId,
    catalogId: credential.catalogId,
    totalProcessed: enrichedProducts.length,
    uploadMethod: "product_upload",
    mappingErrors,
    expectedSkuIds,
    uploadErrors: apiResult.errors,
    feedLogId: apiResult.feedLogId,
  });

  let succeeded = 0;
  let feedLogId = apiResult.feedLogId;
  let confirmed: Awaited<ReturnType<typeof confirmTiktokCatalogUpload>> | undefined;

  if (acceptedSkuIds.length > 0) {
    logTiktok(
      "confirm_start",
      `acceptedSkuCount=${acceptedSkuIds.length} feedLogId=${apiResult.feedLogId ?? ""} skus=${acceptedSkuIds.slice(0, 10).join(",")}`,
    );
    await appendLog({
      taskId: params.taskId,
      startedAt: params.startedAt,
      message: params.msg("adsCatalog.asyncTiktokVerifyingUpload", {
        count: acceptedSkuIds.length,
      }),
    });

    confirmed = await confirmTiktokCatalogUpload({
      accessToken: credential.accessToken,
      advertiserId: credential.advertiserId,
      bcId: credential.bcId,
      catalogId: credential.catalogId,
      feedLogId: apiResult.feedLogId,
      expectedSkuIds: acceptedSkuIds,
    });
    succeeded = confirmed.succeeded;
    feedLogId = confirmed.feedLogId ?? feedLogId;
    for (const err of confirmed.errors) {
      errors.push({ productId: err.id, reason: err.reason });
    }

    logTiktok(
      "confirm_done",
      `via=${confirmed.verifiedVia} succeeded=${confirmed.succeeded} failed=${confirmed.errors.length} feedLogId=${confirmed.feedLogId ?? ""}`,
    );
    if (confirmed.errors.length > 0) {
      console.warn(
        `${LOG_PREFIX}[TikTok] taskId=${params.taskId} step=confirm_errors ${JSON.stringify(confirmed.errors.slice(0, 20))}`,
      );
    }

    if (confirmed.verifiedVia === "unverified" || confirmed.errors.length > 0) {
      await appendLog({
        taskId: params.taskId,
        startedAt: params.startedAt,
        message: params.msg("adsCatalog.asyncTiktokVerifyResult", {
          succeeded: confirmed.succeeded,
          failed: confirmed.errors.length,
          via: confirmed.verifiedVia,
        }),
      });
    }
  } else {
    logTiktok("confirm_skipped", "no accepted skus after upload");
  }

  const result: AdsCatalogSyncTaskResult = {
    platform: "tiktok",
    totalProcessed: enrichedProducts.length,
    succeeded,
    failed: errors.length,
    errors,
    syncMode: "api_managed",
    uploadMethod: "product_upload",
    catalogId: credential.catalogId,
    productResults: buildTiktokProductResults({
      expectedSkuIds: acceptedSkuIds.length > 0 ? acceptedSkuIds : expectedSkuIds,
      confirmed: confirmed ?? {
        succeeded: 0,
        errors: [
          ...apiResult.errors.map((entry) => ({ id: entry.id, reason: entry.reason })),
          ...mappingErrors.map((entry) => ({ id: entry.productId, reason: entry.reason })),
        ],
        verifiedVia: "unverified",
      },
    }),
    ...(confirmed?.feedLogStatus ? { feedLogStatus: confirmed.feedLogStatus } : {}),
    ...(confirmed?.feedCsvSummary ? { feedCsvSummary: confirmed.feedCsvSummary } : {}),
    ...(feedLogId ? { feedLogId } : {}),
  };

  logTiktok(
    "finish",
    `succeeded=${result.succeeded} failed=${result.failed} catalogId=${result.catalogId ?? ""} feedLogId=${result.feedLogId ?? ""}`,
  );

  await finishAdsCatalogSync({
    taskId: params.taskId,
    startedAt: params.startedAt,
    result,
    msg: params.msg,
  });
}

async function runTiktokFeedFileSync(params: {
  taskId: string;
  startedAt: number;
  shop: string;
  shopDomain: string;
  defaultCurrency?: string;
  brand?: string;
  products: RawShopifyProductForCatalog[];
  credential: {
    accessToken: string;
    refreshToken?: string | null;
    advertiserId: string;
    bcId: string;
    catalogId: string;
    catalogName?: string | null;
  };
  msg: MsgFn;
  logTiktok: (step: string, detail?: string) => void;
}): Promise<void> {
  const { credential, logTiktok } = params;
  const mappingErrors: AdsCatalogSyncTaskResult["errors"] = [];
  const rows: TiktokFeedCsvRow[] = [];
  for (const product of params.products) {
    const mapped = mapShopifyToTiktokFeedCsv(product, {
      shopDomain: params.shopDomain,
      defaultCurrency: params.defaultCurrency,
      brand: params.brand,
    });
    if (mapped.ok) {
      rows.push(mapped.row);
    } else {
      mappingErrors.push({ productId: mapped.productId, reason: mapped.reason });
    }
  }

  logTiktok(
    "path_b_feed_file_map_done",
    `mapped=${rows.length} skipped=${mappingErrors.length} catalogId=${credential.catalogId}`,
  );

  if (rows.length === 0) {
    await finishAdsCatalogSync({
      taskId: params.taskId,
      startedAt: params.startedAt,
      result: {
        platform: "tiktok",
        totalProcessed: params.products.length,
        succeeded: 0,
        failed: mappingErrors.length,
        errors: mappingErrors,
        syncMode: "api_managed",
        uploadMethod: "product_file",
        catalogId: credential.catalogId,
      },
      msg: params.msg,
    });
    return;
  }

  await appendLog({
    taskId: params.taskId,
    startedAt: params.startedAt,
    message: params.msg("adsCatalog.asyncPushingTiktokFeed", { count: rows.length }),
  });

  const csvText = buildTiktokFeedCsv(rows);
  let fileUrl: string;
  try {
    const uploaded = await uploadTiktokFeedCsvAndGetUrl({
      shop: params.shop,
      catalogId: credential.catalogId,
      taskId: params.taskId,
      csvText,
    });
    fileUrl = uploaded.fileUrl;
    logTiktok("feed_csv_uploaded", `blobPath=${uploaded.blobPath} bytes=${csvText.length}`);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    logTiktok("feed_csv_upload_failed", reason);
    await failTask({
      taskId: params.taskId,
      startedAt: params.startedAt,
      errorMsg: params.msg("adsCatalog.asyncTiktokFeedBlobFailed", { reason }),
    });
    return;
  }

  let feedLogId: string | undefined;
  try {
    const fileResult = await uploadTiktokCatalogProductFile({
      accessToken: credential.accessToken,
      bcId: credential.bcId,
      catalogId: credential.catalogId,
      fileUrl,
      updateMode: "INCREMENTAL",
    });
    feedLogId = fileResult.feedLogId;
    logTiktok(
      "product_file_submitted",
      `feedLogId=${feedLogId ?? ""} requestId=${fileResult.requestId ?? ""}`,
    );
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    if (isShopifySyncedCatalogUploadError(reason)) {
      logTiktok("shopify_lock_detected_switch_official", `catalogId=${credential.catalogId}`);
      await setTiktokCatalogCredential(params.shop, {
        accessToken: credential.accessToken,
        refreshToken: credential.refreshToken ?? undefined,
        advertiserId: credential.advertiserId,
        bcId: credential.bcId,
        catalogId: credential.catalogId,
        catalogName: credential.catalogName ?? undefined,
        bindingMode: "shopify_official",
      });
      await appendLog({
        taskId: params.taskId,
        startedAt: params.startedAt,
        message: params.msg("adsCatalog.asyncTiktokSwitchedToOfficial"),
      });
      await finishAdsCatalogSync({
        taskId: params.taskId,
        startedAt: params.startedAt,
        result: {
          platform: "tiktok",
          totalProcessed: params.products.length,
          succeeded: rows.length,
          failed: mappingErrors.length,
          errors: mappingErrors,
          syncMode: "shopify_official",
          catalogId: credential.catalogId,
        },
        msg: params.msg,
      });
      return;
    }
    logTiktok("product_file_failed", reason);
    await failTask({
      taskId: params.taskId,
      startedAt: params.startedAt,
      errorMsg: params.msg("adsCatalog.asyncTiktokFeedUploadFailed", { reason }),
      result: {
        platform: "tiktok",
        totalProcessed: params.products.length,
        succeeded: 0,
        failed: mappingErrors.length + rows.length,
        errors: [...mappingErrors, { productId: "feed", reason }],
        syncMode: "api_managed",
        uploadMethod: "product_file",
        catalogId: credential.catalogId,
        feedFileUrl: fileUrl,
      } as unknown as Record<string, unknown>,
    });
    return;
  }

  const expectedSkuIds = rows.map((row) => row.sku_id);
  await persistTiktokSyncProgress({
    taskId: params.taskId,
    catalogId: credential.catalogId,
    totalProcessed: params.products.length,
    uploadMethod: "product_file",
    mappingErrors,
    expectedSkuIds,
    feedLogId,
  });

  const errors = [...mappingErrors];
  let succeeded = 0;

  await appendLog({
    taskId: params.taskId,
    startedAt: params.startedAt,
    message: params.msg("adsCatalog.asyncTiktokVerifyingUpload", {
      count: expectedSkuIds.length,
    }),
  });

  const confirmed = await confirmTiktokCatalogUpload({
    accessToken: credential.accessToken,
    advertiserId: credential.advertiserId,
    bcId: credential.bcId,
    catalogId: credential.catalogId,
    feedLogId,
    expectedSkuIds,
    deps: {
      // Feed 入库较慢：约 36 * 10s ≈ 6 分钟确认窗口
      maxAttempts: 36,
      intervalMs: 10_000,
    },
  });
  succeeded = confirmed.succeeded;
  feedLogId = confirmed.feedLogId ?? feedLogId;
  for (const err of confirmed.errors) {
    errors.push({ productId: err.id, reason: err.reason });
  }

  logTiktok(
    "feed_confirm_done",
    `via=${confirmed.verifiedVia} succeeded=${confirmed.succeeded} failed=${confirmed.errors.length} feedLogId=${feedLogId ?? ""}`,
  );

  if (confirmed.verifiedVia === "unverified" || confirmed.errors.length > 0) {
    await appendLog({
      taskId: params.taskId,
      startedAt: params.startedAt,
      message: params.msg("adsCatalog.asyncTiktokVerifyResult", {
        succeeded: confirmed.succeeded,
        failed: confirmed.errors.length,
        via: confirmed.verifiedVia,
      }),
    });
  }

  const result: AdsCatalogSyncTaskResult = {
    platform: "tiktok",
    totalProcessed: params.products.length,
    succeeded,
    failed: errors.length,
    errors,
    syncMode: "api_managed",
    uploadMethod: "product_file",
    catalogId: credential.catalogId,
    feedFileUrl: fileUrl,
    productResults: buildTiktokProductResults({
      expectedSkuIds,
      confirmed,
    }),
    ...(confirmed.feedLogStatus ? { feedLogStatus: confirmed.feedLogStatus } : {}),
    ...(confirmed.feedCsvSummary ? { feedCsvSummary: confirmed.feedCsvSummary } : {}),
    ...(feedLogId ? { feedLogId } : {}),
  };

  logTiktok(
    "feed_finish",
    `succeeded=${result.succeeded} failed=${result.failed} catalogId=${result.catalogId ?? ""} feedLogId=${result.feedLogId ?? ""}`,
  );

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
  const finalMessage =
    params.result.platform === "tiktok" && params.result.syncMode === "shopify_official"
      ? params.msg("adsCatalog.asyncTiktokOfficialCompleted", {
          succeeded: params.result.succeeded,
          failed: params.result.failed,
        })
      : params.msg("adsCatalog.asyncCompleted", {
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
