/**
 * Shop *size* profile — records roughly how much translatable data a shop has,
 * so the admin can label each store 超大 / 大 / 中等 / 小商店 at a glance.
 *
 * Database:  shop            (COSMOS_SHOP_DATABASE_ID)
 * Container: shop_profile    (COSMOS_SHOP_PROFILE_CONTAINER), partition key /shopName
 * Document id: shopName      — one profile per shop; upsert pattern. The container
 * is intended to hold other shop-related docs later (discriminated by `type`).
 *
 * Data volume = total bytes of translatable source text fetched during INIT.
 * It is tracked per target language and the shop's tier is derived from the
 * LARGEST language (以最多的语言为准) — the first full translation of a language
 * dominates over later incremental (auto-update) jobs, which only fetch deltas.
 */
import { CosmosClient, type Container } from "@azure/cosmos";

// ── Tier model ──────────────────────────────────────────────────────────────

export type ShopSizeTier = "超大商店" | "大商店" | "中等商店" | "小商店";

const MiB = 1024 * 1024;

/** Tier boundaries in bytes (env-overridable). 小 < MEDIUM ≤ 中 < LARGE ≤ 大 < HUGE ≤ 超大. */
function tierBounds(): { medium: number; large: number; huge: number } {
  const num = (v: string | undefined, def: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : def;
  };
  return {
    medium: num(process.env.SHOP_SIZE_TIER_MEDIUM_BYTES, 2 * MiB),  // 2 MB
    large: num(process.env.SHOP_SIZE_TIER_LARGE_BYTES, 10 * MiB),  // 10 MB
    huge: num(process.env.SHOP_SIZE_TIER_HUGE_BYTES, 50 * MiB),  // 50 MB
  };
}

export function tierForBytes(bytes: number): ShopSizeTier {
  const { medium, large, huge } = tierBounds();
  if (bytes >= huge) return "超大商店";
  if (bytes >= large) return "大商店";
  if (bytes >= medium) return "中等商店";
  return "小商店";
}

// ── Document shape ──────────────────────────────────────────────────────────

export type ShopSizeLanguageStat = {
  bytes: number;
  items: number;
  units: number;
  updatedAt: string;
};

export type ShopSizeProfile = {
  id: string;            // = shopName
  shopName: string;
  type: "size";          // discriminator — other shop docs may live in this container
  /** Target language with the largest data volume (the basis for the tier). */
  largestLanguage: string | null;
  /** Data volume (bytes) of the largest language. */
  dataBytes: number;
  /** Convenience: dataBytes rounded to KB. */
  dataSizeKB: number;
  sizeTier: ShopSizeTier;
  /** Per-target-language stats; each language keeps its largest observed volume. */
  languages: Record<string, ShopSizeLanguageStat>;
  updatedAt: string;
};

// ── Container ───────────────────────────────────────────────────────────────

let _client: CosmosClient | null = null;
let _ensureContainerPromise: Promise<Container> | null = null;

function getClient(): CosmosClient {
  if (!_client) {
    const endpoint = process.env.COSMOS_ENDPOINT?.trim();
    const key = process.env.COSMOS_KEY?.trim();
    if (!endpoint || !key) throw new Error("COSMOS_ENDPOINT and COSMOS_KEY are required");
    _client = new CosmosClient({ endpoint, key });
  }
  return _client;
}

function databaseId(): string {
  return process.env.COSMOS_SHOP_DATABASE_ID?.trim() || "shop";
}

function containerId(): string {
  return process.env.COSMOS_SHOP_PROFILE_CONTAINER?.trim() || "shop_profile";
}

async function ensureContainer(): Promise<Container> {
  if (_ensureContainerPromise) return _ensureContainerPromise;

  _ensureContainerPromise = (async () => {
    const client = getClient();
    const { database } = await client.databases.createIfNotExists({ id: databaseId() });
    const { container } = await database.containers.createIfNotExists({
      id: containerId(),
      partitionKey: { paths: ["/shopName"] },
    });
    return container;
  })();

  return _ensureContainerPromise;
}

// ── Write path (called from initWorker) ─────────────────────────────────────

/**
 * Record the data volume observed for one target language during INIT and
 * recompute the shop's tier from the largest language.
 *
 * Best-effort: never throws (a failed profile write must not fail the job).
 * Per-language volume keeps the MAX observed bytes so incremental/auto jobs
 * (which fetch only deltas) don't shrink a language's recorded full size.
 */
export async function recordShopSizeFromInit(input: {
  shopName: string;
  target: string;
  bytes: number;
  items: number;
  units: number;
}): Promise<void> {
  const { shopName, target, bytes, items, units } = input;
  if (!shopName || !target || bytes <= 0) return;

  try {
    const container = await ensureContainer();
    const now = new Date().toISOString();

    const { resource: existing } = await container
      .item(shopName, shopName)
      .read<ShopSizeProfile>()
      .catch(() => ({ resource: null as ShopSizeProfile | null }));

    const languages: Record<string, ShopSizeLanguageStat> = { ...(existing?.languages ?? {}) };
    const prev = languages[target];
    // Keep the largest observed volume for this language.
    if (!prev || bytes >= prev.bytes) {
      languages[target] = { bytes, items, units, updatedAt: now };
    }

    let largestLanguage: string | null = null;
    let dataBytes = 0;
    for (const [lang, stat] of Object.entries(languages)) {
      if (stat.bytes > dataBytes) {
        dataBytes = stat.bytes;
        largestLanguage = lang;
      }
    }

    const doc: ShopSizeProfile = {
      id: shopName,
      shopName,
      type: "size",
      largestLanguage,
      dataBytes,
      dataSizeKB: Math.round(dataBytes / 1024),
      sizeTier: tierForBytes(dataBytes),
      languages,
      updatedAt: now,
    };

    await container.items.upsert<ShopSizeProfile>(doc);
    console.log(
      `[shopSize] ${shopName} ${target}=${(bytes / 1024).toFixed(0)}KB → tier=${doc.sizeTier} (max ${largestLanguage}=${doc.dataSizeKB}KB)`,
    );
  } catch (e) {
    console.warn(`[shopSize] recordShopSizeFromInit failed ${shopName}`, e);
  }
}
