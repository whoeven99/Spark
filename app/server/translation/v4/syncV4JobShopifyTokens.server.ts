import { resolveShopAccessTokenForWorker } from "../../shopify/resolveShopAccessToken.server";
import { listV4Jobs, updateV4Job } from "./cosmosV4Store.server";
import {
  ACTIVE_V4_STATUSES,
  type TranslationV4Job,
  type TranslationV4Status,
} from "./types";

const LOG = "[v4:token-sync]";

const TOKEN_SYNC_STATUSES: TranslationV4Status[] = [
  ...ACTIVE_V4_STATUSES,
  "PAUSED",
  "FAILED",
];

function isShopifyAuthTokenError(job: TranslationV4Job): boolean {
  const msg = (job.errorMessage ?? "").toLowerCase();
  return (
    msg.includes("401") ||
    msg.includes("invalid api key") ||
    msg.includes("access token") ||
    msg.includes("unrecognized login")
  );
}

function shouldSyncJobToken(job: TranslationV4Job): boolean {
  if (TOKEN_SYNC_STATUSES.includes(job.status)) {
    if (job.status === "FAILED" && !isShopifyAuthTokenError(job)) return false;
    return true;
  }
  return false;
}

/**
 * 登录 / OAuth 回调后，把 Session 表中最新的 Shopify token 同步到
 * 该店铺仍可能需要调 Shopify GraphQL 的翻译任务（Cosmos）。
 */
export async function syncV4JobShopifyTokensFromSession(
  shop: string,
  onlineFallback?: string | null,
): Promise<number> {
  const accessToken = await resolveShopAccessTokenForWorker(shop, onlineFallback);
  if (!accessToken) {
    console.warn(`${LOG} skip shop=${shop} — no valid session token`);
    return 0;
  }

  const jobs = await listV4Jobs(shop, 100);
  const targets = jobs.filter(shouldSyncJobToken);
  if (targets.length === 0) return 0;

  let updated = 0;
  for (const job of targets) {
    if (job.shopifyAccessToken === accessToken) continue;
    const saved = await updateV4Job(shop, job.id, { shopifyAccessToken: accessToken });
    if (saved) {
      updated++;
      console.info(
        `${LOG} updated job=${job.id} status=${job.status} shop=${shop}`,
      );
    }
  }

  if (updated > 0) {
    console.info(`${LOG} shop=${shop} synced ${updated}/${targets.length} job(s)`);
  }
  return updated;
}
