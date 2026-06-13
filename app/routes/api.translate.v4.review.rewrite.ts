/**
 * POST /api/translate/v4/review/rewrite
 *   body: { taskId, shopName?, resourceId, key, value }
 *
 * 人工改写单个字段译文并重新写回 Shopify。改写前实时取该 key 的最新内容指纹
 * （digest），避免使用 Blob 中可能已过期的旧 digest 导致写回被拒。写回后回读校验。
 */
import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import { getV4Job } from "../server/translation/v4/cosmosV4Store.server";
import {
  fetchResourceShopifyState,
  rewriteTranslation,
  resolveFieldStatus,
} from "../server/translation/v4/reviewShopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  if (request.method !== "POST") {
    return data({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const body = (await request.json().catch(() => null)) as {
    taskId?: string;
    shopName?: string;
    resourceId?: string;
    key?: string;
    value?: string;
  } | null;

  const taskId = body?.taskId?.trim() || "";
  const shopName = body?.shopName?.trim() || session.shop;
  const resourceId = body?.resourceId?.trim() || "";
  const key = body?.key?.trim() || "";
  const value = typeof body?.value === "string" ? body.value : "";

  if (!taskId || !resourceId || !key) {
    return data({ ok: false, error: "taskId, resourceId, key required" }, { status: 400 });
  }
  if (shopName !== session.shop) {
    return data({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const job = await getV4Job(shopName, taskId);
  if (!job) return data({ ok: false, error: "task not found" }, { status: 404 });

  const locale = job.target;

  // 1. 取最新 digest
  const before = await fetchResourceShopifyState(admin, resourceId, locale);
  const digest = before.digestByKey.get(key);
  if (!digest) {
    return data(
      { ok: false, error: `资源缺少 key=${key} 的内容指纹，无法写回（内容可能已变更）` },
      { status: 409 },
    );
  }

  // 2. 写回
  const result = await rewriteTranslation(admin, resourceId, locale, key, value, digest);
  if (!result.success) {
    return data(
      {
        ok: false,
        error: result.userErrors.map((e) => e.message).join("; ") || "写回失败",
      },
      { status: 502 },
    );
  }

  // 3. 回读校验
  const after = await fetchResourceShopifyState(admin, resourceId, locale);
  const stored = after.translations.get(key);
  return data({
    ok: true,
    field: {
      key,
      translatedValue: value,
      shopifyValue: stored ? stored.value : null,
      outdated: Boolean(stored?.outdated),
      status: resolveFieldStatus(value, stored),
    },
  });
};
