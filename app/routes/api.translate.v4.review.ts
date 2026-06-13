/**
 * GET /api/translate/v4/review
 *   ?taskId=&shopName=&module=&page=&pageSize=
 *
 * 翻译 V4「写回详情」对账接口：以 Blob 中的期望译文为基准，对当前页的资源
 * 实时查询 Shopify 线上译文并逐字段对账。按 resource 分页以控制 Shopify 调用量。
 */
import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import { getV4Job } from "../server/translation/v4/cosmosV4Store.server";
import {
  loadJobReviewResources,
  type ReviewResource,
} from "../server/translation/v4/reviewData.server";
import {
  fetchResourceShopifyState,
  resolveFieldStatus,
  type ReviewFieldStatus,
} from "../server/translation/v4/reviewShopify.server";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

type RowField = {
  key: string;
  originalValue: string;
  translatedValue: string;
  shopifyValue: string | null;
  outdated: boolean;
  status: ReviewFieldStatus;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const taskId = url.searchParams.get("taskId")?.trim() || "";
  const shopName = url.searchParams.get("shopName")?.trim() || session.shop;
  const moduleFilter = url.searchParams.get("module")?.trim() || "";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(url.searchParams.get("pageSize")) || DEFAULT_PAGE_SIZE),
  );

  if (!taskId) return data({ ok: false, error: "taskId required" }, { status: 400 });
  if (shopName !== session.shop) {
    return data({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const job = await getV4Job(shopName, taskId);
  if (!job) return data({ ok: false, error: "task not found" }, { status: 404 });

  const blobPrefix = job.blobPrefix || `tasks/v4/${shopName}/${taskId}`;
  const modulesToLoad = moduleFilter ? [moduleFilter] : job.modules;
  const allResources = await loadJobReviewResources(blobPrefix, modulesToLoad);

  const summary = {
    totalResources: allResources.length,
    successResources: allResources.filter((r) => r.writebackResult === "success").length,
    failedResources: allResources.filter((r) => r.writebackResult === "failed").length,
    totalFields: allResources.reduce((sum, r) => sum + r.fields.length, 0),
  };

  const totalPages = Math.max(1, Math.ceil(allResources.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageResources = allResources.slice((safePage - 1) * pageSize, safePage * pageSize);

  const rows = await Promise.all(
    pageResources.map((resource) => buildRow(admin, resource, job.target)),
  );

  return data({
    ok: true,
    job: {
      source: job.source,
      target: job.target,
      modules: job.modules,
      status: job.status,
      writebackDone: job.metrics.writebackDone,
      writebackFailed: job.metrics.writebackFailed,
      verifyDone: job.metrics.verifyDone,
      verifyFailed: job.metrics.verifyFailed,
    },
    summary,
    page: safePage,
    pageSize,
    totalPages,
    moduleOptions: [...new Set(job.modules)],
    rows,
  });
};

async function buildRow(
  admin: Parameters<typeof fetchResourceShopifyState>[0],
  resource: ReviewResource,
  locale: string,
): Promise<{
  resourceId: string;
  module: string;
  writebackResult: ReviewResource["writebackResult"];
  shopifyError: string | null;
  fields: RowField[];
}> {
  try {
    const state = await fetchResourceShopifyState(admin, resource.resourceId, locale);
    const fields: RowField[] = resource.fields.map((f) => {
      const stored = state.translations.get(f.key);
      return {
        key: f.key,
        originalValue: f.originalValue,
        translatedValue: f.translatedValue,
        shopifyValue: stored ? stored.value : null,
        outdated: Boolean(stored?.outdated),
        status: resolveFieldStatus(f.translatedValue, stored),
      };
    });
    return {
      resourceId: resource.resourceId,
      module: resource.module,
      writebackResult: resource.writebackResult,
      shopifyError: null,
      fields,
    };
  } catch (err) {
    // 单个资源读取失败不影响整页：标记错误，字段状态置为 missing。
    const fields: RowField[] = resource.fields.map((f) => ({
      key: f.key,
      originalValue: f.originalValue,
      translatedValue: f.translatedValue,
      shopifyValue: null,
      outdated: false,
      status: "missing",
    }));
    return {
      resourceId: resource.resourceId,
      module: resource.module,
      writebackResult: resource.writebackResult,
      shopifyError: err instanceof Error ? err.message : String(err),
      fields,
    };
  }
}
