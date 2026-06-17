import { useEffect } from "react";

/**
 * 前端功能埋点工具（嵌入式 App）。
 *
 * - `trackFeature`：fire-and-forget 上报到 `/api/feature-track`，绝不阻塞 UI；
 * - `useFeatureView`：页面挂载时上报一次浏览事件（同一 feature+path 去重）。
 *
 * 鉴权依赖 Shopify App Bridge 注入的嵌入参数（shop/host/id_token 等），
 * 这些参数都在 `window.location.search` 上，故请求 URL 需带上 search。
 */

/** Spark App 功能标识，与 admin 侧筛选保持一致。 */
export type FeatureKey =
  | "chat"
  | "diagnosis"
  | "translation-v4"
  | "product-improve"
  | "image-studio"
  | "order-monitor"
  | "billing"
  | "ads-catalog";

/** 已上报过的 view 去重集合（page+feature 维度，单次会话内）。 */
const viewedKeys = new Set<string>();

export function trackFeature(
  feature: FeatureKey | string,
  action: string,
  extra?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  if (!feature || !action) return;

  const search = window.location.search ?? "";
  const path = window.location.pathname ?? "";

  const payload = JSON.stringify({ feature, action, path, extra });

  try {
    void fetch(`/api/feature-track${search}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // 埋点失败静默忽略，不影响用户操作。
    });
  } catch {
    // 极端环境下 fetch 不可用时忽略。
  }
}

/** 页面浏览埋点：组件挂载时上报一次（同一 feature + 路径仅报一次）。 */
export function useFeatureView(
  feature: FeatureKey,
  extra?: Record<string, unknown>,
): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `${feature}:${window.location.pathname}`;
    if (viewedKeys.has(key)) return;
    viewedKeys.add(key);
    trackFeature(feature, "view", extra);
    // 仅在挂载时上报一次，feature 在页面生命周期内固定。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature]);
}
