import prisma from "../../db.server";
import { checkMetaCatalogStatusesForShop } from "./metaCatalogStatusChecker.server";

const LOG_PREFIX = "[Webhook][MetaCatalog]";

/**
 * 事件到期刷新前的合并窗口。批量改动 catalog 会连续推很多条事件，
 * 而每次刷新都是一次全量拉取，所以先合并再拉。
 */
const REFRESH_DEBOUNCE_MS = 60 * 1000;

/** 已排队等待刷新的店铺，用于合并同一窗口内的重复事件。 */
const pendingRefresh = new Map<string, NodeJS.Timeout>();

/** Meta Developer Console 未配置环境变量时的默认 Verify Token（与审核配置一致）。 */
export const META_CATALOG_WEBHOOK_VERIFY_TOKEN_DEFAULT = "123456";

export function getMetaCatalogWebhookVerifyToken(): string {
  return (
    process.env.META_WEBHOOK_VERIFY_TOKEN ?? META_CATALOG_WEBHOOK_VERIFY_TOKEN_DEFAULT
  ).trim();
}

/**
 * Meta Catalog Webhook Callback URL。
 * 依赖 SHOPIFY_APP_URL，例如 https://assistant-w7b.onrender.com/webhooks/meta/catalog
 */
export function getMetaCatalogWebhookCallbackUrl(): string | null {
  const appUrl = (process.env.SHOPIFY_APP_URL ?? "").replace(/\/$/, "");
  if (!appUrl) return null;
  return `${appUrl}/webhooks/meta/catalog`;
}

/**
 * Meta Webhooks 订阅校验（GET hub.mode=subscribe）。
 * @see https://developers.facebook.com/docs/graph-api/webhooks/getting-started
 */
export function verifyMetaCatalogWebhookSubscription(request: Request): Response {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  const expected = getMetaCatalogWebhookVerifyToken();

  if (!expected) {
    console.warn(`${LOG_PREFIX} META_WEBHOOK_VERIFY_TOKEN not configured, rejecting`);
    return new Response(null, { status: 403 });
  }

  if (mode === "subscribe" && token === expected && challenge) {
    console.info(`${LOG_PREFIX} subscription verified`);
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  console.warn(`${LOG_PREFIX} subscription verification failed mode=${mode ?? "(none)"}`);
  return new Response(null, { status: 403 });
}

/** 从 Meta webhook 信封中收集受影响的 catalog id。 */
export function collectMetaCatalogIds(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const entries = (body as { entry?: unknown }).entry;
  if (!Array.isArray(entries)) return [];

  const ids = new Set<string>();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    // product_catalog 订阅下 entry.id 即 catalog id。
    if (typeof record.id === "string" && record.id.trim()) {
      ids.add(record.id.trim());
    }
    // 部分事件把 catalog id 放在 changes[].value 里，一并兜住。
    if (!Array.isArray(record.changes)) continue;
    for (const change of record.changes) {
      if (!change || typeof change !== "object") continue;
      const value = (change as { value?: unknown }).value;
      if (!value || typeof value !== "object") continue;
      for (const key of ["catalog_id", "product_catalog_id"]) {
        const candidate = (value as Record<string, unknown>)[key];
        if (typeof candidate === "string" && candidate.trim()) ids.add(candidate.trim());
        if (typeof candidate === "number") ids.add(String(candidate));
      }
    }
  }
  return [...ids];
}

/** 反查哪个店铺绑定了该 catalog（与 GMC 通知同一套 json_extract 方式）。 */
async function findShopByCatalogId(catalogId: string): Promise<string | null> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ shop: string }>>(
      `SELECT shop FROM "AdPlatformCredential" WHERE platform = 'meta_catalog' AND json_extract(credentials, '$.catalogId') = ? LIMIT 1`,
      catalogId,
    );
    return rows[0]?.shop ?? null;
  } catch (e) {
    console.warn(
      `${LOG_PREFIX} findShopByCatalogId failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }
}

/**
 * 合并窗口内的事件后刷新审核状态。
 *
 * 刷新是一次全量拉取（最多 250 条），所以不能放在 webhook 响应链路里：
 * Meta 对非 200 会重试，必须先快速 200 再后台刷新。窗口很短，
 * 进程重启丢失的代价可接受，下一次事件或手动刷新会补上。
 */
function scheduleCatalogStatusRefresh(shop: string): void {
  if (pendingRefresh.has(shop)) return;
  const timer = setTimeout(() => {
    pendingRefresh.delete(shop);
    void checkMetaCatalogStatusesForShop(shop)
      .then((result) => {
        if (!result) return;
        console.info(
          `${LOG_PREFIX} refreshed shop=${shop} checked=${result.checked} disapproved=${result.disapproved}`,
        );
      })
      .catch((e) => {
        console.error(
          `${LOG_PREFIX} refresh failed shop=${shop} ${e instanceof Error ? e.message : String(e)}`,
        );
      });
  }, REFRESH_DEBOUNCE_MS);
  if (typeof timer.unref === "function") timer.unref();
  pendingRefresh.set(shop, timer);
}

/**
 * Catalog 事件通知（POST）。快速 200 避免 Meta 重试风暴，
 * 同时把受影响店铺的商品审核状态排入后台刷新，让 MetaProductStatus 真正被推送驱动更新。
 */
export async function handleMetaCatalogWebhookEvent(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    console.warn(`${LOG_PREFIX} failed to parse JSON body`);
    return new Response(null, { status: 200 });
  }

  const catalogIds = collectMetaCatalogIds(body);
  if (catalogIds.length === 0) {
    console.info(`${LOG_PREFIX} event without catalog id ${JSON.stringify(body).slice(0, 500)}`);
    return new Response(null, { status: 200 });
  }

  const shops = new Set<string>();
  for (const catalogId of catalogIds) {
    const shop = await findShopByCatalogId(catalogId);
    if (shop) {
      shops.add(shop);
    } else {
      console.warn(`${LOG_PREFIX} no shop for catalogId=${catalogId}, ignoring`);
    }
  }

  for (const shop of shops) {
    scheduleCatalogStatusRefresh(shop);
  }
  console.info(
    `${LOG_PREFIX} event received catalogIds=${catalogIds.join(",")} scheduledShops=${shops.size}`,
  );
  return new Response(null, { status: 200 });
}
