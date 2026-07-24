/**
 * Web Pixel 自动配置（幂等）。
 *
 * 在 OAuth 回调 / 进入 /app 时调用：查询当前店铺的 webPixel，
 * - 不存在 → webPixelCreate；
 * - shopName / ingestEndpoint 与期望不一致 → webPixelUpdate（保留商家手动调过的 sampling / debug）。
 *
 * 任何失败只记日志，不阻断安装与页面主流程。
 */

import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import {
  formatGraphqlErrors,
  parseAdminGraphqlJson,
} from "../shopify/parseAdminGraphqlJson.server";

const LOG = "[WebPixel]";

/** 同一进程内每个 shop 的校验间隔，避免每次页面加载都打 Admin API。 */
const ENSURE_TTL_MS = 10 * 60 * 1000;
const lastEnsuredAt = new Map<string, number>();

const WEB_PIXEL_QUERY = `#graphql
  query SparkWebPixel {
    webPixel {
      id
      settings
    }
  }
`;

const WEB_PIXEL_CREATE_MUTATION = `#graphql
  mutation SparkWebPixelCreate($webPixel: WebPixelInput!) {
    webPixelCreate(webPixel: $webPixel) {
      webPixel {
        id
        settings
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

const WEB_PIXEL_UPDATE_MUTATION = `#graphql
  mutation SparkWebPixelUpdate($id: ID!, $webPixel: WebPixelInput!) {
    webPixelUpdate(id: $id, webPixel: $webPixel) {
      webPixel {
        id
        settings
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

type WebPixelNode = { id?: string; settings?: string | null };

type WebPixelQueryData = { webPixel?: WebPixelNode | null };

type WebPixelMutationData = {
  webPixelCreate?: WebPixelMutationPayload;
  webPixelUpdate?: WebPixelMutationPayload;
};

type WebPixelMutationPayload = {
  webPixel?: WebPixelNode | null;
  userErrors?: Array<{ field?: string[] | null; message?: string; code?: string }>;
};

export type WebPixelSettings = {
  shopName: string;
  ingestEndpoint: string;
  sampling: string;
  debug: string;
};

export type EnsureWebPixelResult =
  | { status: "created"; id?: string }
  | { status: "updated"; id?: string }
  | { status: "ok" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

/** ingestEndpoint：PIXEL_INGEST_ENDPOINT 优先，缺省回退 SHOPIFY_APP_URL + /api/pixel-ingest。 */
export function resolvePixelIngestEndpoint(): string | null {
  const explicit = process.env.PIXEL_INGEST_ENDPOINT?.trim();
  if (explicit) return explicit;

  const appUrl = process.env.SHOPIFY_APP_URL?.trim().replace(/\/+$/, "");
  if (!appUrl) return null;
  return `${appUrl}/api/pixel-ingest`;
}

export function buildDesiredWebPixelSettings(
  shop: string,
  ingestEndpoint: string,
): WebPixelSettings {
  return {
    shopName: shop,
    ingestEndpoint,
    sampling: "100",
    debug: "false",
  };
}

function parseSettingsJson(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** webPixel 查询在像素不存在时的 GraphQL / SDK 错误文案。 */
function isPixelNotFoundMessage(message: string): boolean {
  return /no web pixel|not found/i.test(message);
}

/** Response body 中带 errors 时识别「未配置」（单测 mock / 少数直连场景）。 */
function isPixelNotFoundError(errors: Array<{ message?: string }> | undefined): boolean {
  if (!errors?.length) return false;
  return errors.every((e) => isPixelNotFoundMessage(e.message ?? ""));
}

/** admin.graphql 在 GraphQL error 时会抛 GraphqlQueryError，而非写入 Response body。 */
function isPixelNotFoundThrownError(error: unknown): boolean {
  return error instanceof Error && isPixelNotFoundMessage(error.message);
}

type QueryWebPixelResult =
  | { ok: true; pixel: WebPixelNode | null }
  | { ok: false; reason: string };

async function queryExistingWebPixel(
  admin: ShopifyAdminGraphqlClient,
): Promise<QueryWebPixelResult> {
  try {
    const response = await admin.graphql(WEB_PIXEL_QUERY);
    if (!response.ok) {
      return { ok: false, reason: `HTTP ${response.status}` };
    }

    const payload = await parseAdminGraphqlJson<WebPixelQueryData>(response);
    if (payload.errors?.length && !isPixelNotFoundError(payload.errors)) {
      return { ok: false, reason: formatGraphqlErrors(payload.errors) };
    }

    return { ok: true, pixel: payload.data?.webPixel ?? null };
  } catch (error) {
    if (isPixelNotFoundThrownError(error)) {
      return { ok: true, pixel: null };
    }
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, reason };
  }
}

function shouldSkipByTtl(shop: string, now: number): boolean {
  const last = lastEnsuredAt.get(shop);
  return last !== undefined && now - last < ENSURE_TTL_MS;
}

async function runMutation(
  admin: ShopifyAdminGraphqlClient,
  mutation: string,
  variables: Record<string, unknown>,
  key: "webPixelCreate" | "webPixelUpdate",
): Promise<{ ok: boolean; id?: string; reason?: string }> {
  const response = await admin.graphql(mutation, { variables });
  if (!response.ok) {
    return { ok: false, reason: `HTTP ${response.status}` };
  }

  const payload = await parseAdminGraphqlJson<WebPixelMutationData>(response);
  if (payload.errors?.length) {
    return { ok: false, reason: formatGraphqlErrors(payload.errors) };
  }

  const result = payload.data?.[key];
  const userErrors = result?.userErrors ?? [];
  if (userErrors.length) {
    return {
      ok: false,
      reason: userErrors
        .map((e) => `${e.code ?? ""} ${e.message ?? ""}`.trim())
        .join("；"),
    };
  }

  return { ok: true, id: result?.webPixel?.id };
}

/**
 * 确保当前店铺的 Web Pixel 已激活且 shopName / ingestEndpoint 正确。
 */
export async function ensureWebPixel(
  admin: ShopifyAdminGraphqlClient,
  shop: string,
  options?: { force?: boolean },
): Promise<EnsureWebPixelResult> {
  const now = Date.now();
  if (!options?.force && shouldSkipByTtl(shop, now)) {
    return { status: "skipped", reason: "ttl" };
  }

  const ingestEndpoint = resolvePixelIngestEndpoint();
  if (!ingestEndpoint) {
    console.warn(
      `${LOG} skipped shop=${shop}: PIXEL_INGEST_ENDPOINT / SHOPIFY_APP_URL 均未配置`,
    );
    return { status: "skipped", reason: "missing-endpoint" };
  }

  const desired = buildDesiredWebPixelSettings(shop, ingestEndpoint);

  try {
    const queried = await queryExistingWebPixel(admin);
    if (!queried.ok) {
      console.warn(`${LOG} query errors shop=${shop}: ${queried.reason}`);
      return { status: "failed", reason: queried.reason };
    }

    const existing = queried.pixel;

    if (!existing) {
      const created = await runMutation(
        admin,
        WEB_PIXEL_CREATE_MUTATION,
        { webPixel: { settings: desired } },
        "webPixelCreate",
      );
      if (!created.ok) {
        console.warn(`${LOG} create failed shop=${shop}: ${created.reason}`);
        return { status: "failed", reason: created.reason ?? "create failed" };
      }
      lastEnsuredAt.set(shop, now);
      console.info(`${LOG} created shop=${shop} id=${created.id ?? "unknown"}`);
      return { status: "created", id: created.id };
    }

    const current = parseSettingsJson(existing.settings);
    const driftKeys = (["shopName", "ingestEndpoint"] as const).filter(
      (key) => current[key] !== desired[key],
    );

    if (!driftKeys.length) {
      lastEnsuredAt.set(shop, now);
      return { status: "ok" };
    }

    // 仅修正关键字段；sampling / debug 保留商家已有值（缺失时补默认）。
    const nextSettings: WebPixelSettings = {
      shopName: desired.shopName,
      ingestEndpoint: desired.ingestEndpoint,
      sampling: current.sampling ?? desired.sampling,
      debug: current.debug ?? desired.debug,
    };

    const updated = await runMutation(
      admin,
      WEB_PIXEL_UPDATE_MUTATION,
      { id: existing.id, webPixel: { settings: nextSettings } },
      "webPixelUpdate",
    );
    if (!updated.ok) {
      console.warn(`${LOG} update failed shop=${shop}: ${updated.reason}`);
      return { status: "failed", reason: updated.reason ?? "update failed" };
    }

    lastEnsuredAt.set(shop, now);
    console.info(
      `${LOG} updated shop=${shop} id=${updated.id ?? existing.id ?? "unknown"} drift=${driftKeys.join(",")}`,
    );
    return { status: "updated", id: updated.id ?? existing.id };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`${LOG} ensure failed shop=${shop}: ${reason}`);
    return { status: "failed", reason };
  }
}

/** 仅供测试：清空 TTL 缓存。 */
export function __resetWebPixelEnsureCacheForTest(): void {
  lastEnsuredAt.clear();
}
