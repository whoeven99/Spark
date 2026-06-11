import { pushSlsLog, type PushSlsLogResult } from "./pushLog.server";
import { getShopPlanSnapshot } from "./shopPlanSnapshot.server";

/**
 * 嵌入式 App 功能埋点 → 阿里云 SLS。
 *
 * 与 Web Pixel 上报（topic `spark:shopify:*`）区分：App 内功能点击统一用
 * `spark:app:feature` 这一 topic，按 content 字段（feature / action）区分具体行为，
 * admin 侧通过 topic 精确过滤即可拿到全部 App 埋点。
 */

export const FEATURE_TRACK_TOPIC = "spark:app:feature";
export const FEATURE_TRACK_SCHEMA_VERSION = 1;
export const FEATURE_TRACK_SOURCE = "spark:app";

const MAX_FIELD_LEN = 200;
const MAX_PATH_LEN = 300;
const MAX_EXTRA_BYTES = 4096;

export type FeatureTrackInput = {
  /** 店铺域名（来自服务端 session，前端不可伪造）。 */
  shop: string;
  /** 功能模块，如 translation-v4 / product-improve。 */
  feature: string;
  /** 具体行为，如 view / create_task / generate_description。 */
  action: string;
  /** 触发时所在路由路径。 */
  path?: string;
  /** 业务自定义上下文，会 JSON.stringify 后写入 payload。 */
  extra?: Record<string, unknown>;
  /** 上报时刻（毫秒）。不传则由 SLS 写入层用当前时间。 */
  ts?: number;
};

export type FeatureTrackResult =
  | PushSlsLogResult
  | { ok: false; reason: "invalid_input" };

/** 截断并去空白；非字符串归一化为空串。 */
export function normalizeTrackField(value: unknown, max = MAX_FIELD_LEN): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function serializeExtra(extra: FeatureTrackInput["extra"]): string {
  if (!extra || typeof extra !== "object") return "";
  try {
    const json = JSON.stringify(extra);
    return Buffer.byteLength(json, "utf8") > MAX_EXTRA_BYTES
      ? json.slice(0, MAX_EXTRA_BYTES)
      : json;
  } catch {
    return "";
  }
}

export async function recordFeatureTrack(
  input: FeatureTrackInput,
): Promise<FeatureTrackResult> {
  const feature = normalizeTrackField(input.feature);
  const action = normalizeTrackField(input.action);
  if (!feature || !action) {
    return { ok: false, reason: "invalid_input" };
  }

  const plan = await getShopPlanSnapshot(input.shop);

  return pushSlsLog({
    topic: FEATURE_TRACK_TOPIC,
    source: input.shop || "unknown",
    timestamp: input.ts,
    content: {
      event: FEATURE_TRACK_TOPIC,
      schemaVersion: String(FEATURE_TRACK_SCHEMA_VERSION),
      shopName: input.shop,
      feature,
      action,
      path: normalizeTrackField(input.path, MAX_PATH_LEN),
      plan,
      source: FEATURE_TRACK_SOURCE,
      payload: serializeExtra(input.extra),
    },
  });
}
