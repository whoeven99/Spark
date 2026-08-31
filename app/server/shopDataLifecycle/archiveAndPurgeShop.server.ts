import {
  archiveShopSnapshot,
  type ShopArchiveMode,
  type ShopArchiveResult,
} from "./archiveShopSnapshot.server";
import { purgeShopDataFromTurso, type ShopPurgeResult } from "./purgeShopData.server";
import { hashShopDomain } from "../billing/promo/shopHash.server";

const LOG = "[ShopLifecycle]";

/** 归档最多等这么久；超时也立刻清库（合规优先）。 */
const ARCHIVE_BUDGET_MS = 8_000;

export type ArchiveAndPurgeResult = {
  archive: ShopArchiveResult;
  purge: ShopPurgeResult;
};

function emptyArchiveResult(shop: string, error: string): ShopArchiveResult {
  return {
    ok: false,
    shopHash: hashShopDomain(shop),
    blobPath: null,
    tableCounts: {},
    truncatedTables: [],
    error,
  };
}

function delay(ms: number): Promise<"timeout"> {
  return new Promise((resolve) => {
    setTimeout(() => resolve("timeout"), ms);
  });
}

/**
 * 尽力归档到 Blob，再从 Turso 删除店铺业务数据。
 * PromoClaimLedger 保留。归档失败/超时不阻断删除（合规优先）。
 */
export async function archiveAndPurgeShopData(params: {
  shop: string;
  mode: ShopArchiveMode;
  reason?: string;
}): Promise<ArchiveAndPurgeResult> {
  const shop = params.shop.trim();
  console.info(`${LOG} enter shop=${shop} mode=${params.mode}`);

  const archivePromise = archiveShopSnapshot({
    shop,
    mode: params.mode,
    reason: params.reason,
  });

  const raced = await Promise.race([
    archivePromise.then((result) => ({ kind: "done" as const, result })),
    delay(ARCHIVE_BUDGET_MS).then((kind) => ({ kind })),
  ]);

  let archive: ShopArchiveResult;
  if (raced.kind === "done") {
    archive = raced.result;
  } else {
    console.warn(
      `${LOG} archive budget exceeded shop=${shop} budgetMs=${ARCHIVE_BUDGET_MS} — continuing purge`,
    );
    // 不 await：后台若还能写完 Blob 更好，但不挡清库
    void archivePromise.catch((error) => {
      console.warn(`${LOG} late archive failed shop=${shop}:`, error);
    });
    archive = emptyArchiveResult(shop, `archive_timeout_${ARCHIVE_BUDGET_MS}ms`);
  }

  if (!archive.ok) {
    console.warn(
      `${LOG} archive incomplete shop=${shop} error=${archive.error ?? "partial"} — continuing purge`,
    );
  }

  const purge = await purgeShopDataFromTurso(shop, {
    deleteCommonEventLog: params.mode === "shop_redact",
  });
  console.info(
    `${LOG} done shop=${shop} mode=${params.mode} purgeDeleted=${Object.keys(purge.deleted).length} purgeErrors=${purge.errors.length}`,
  );
  return { archive, purge };
}
