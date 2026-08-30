import {
  archiveShopSnapshot,
  type ShopArchiveMode,
  type ShopArchiveResult,
} from "./archiveShopSnapshot.server";
import { purgeShopDataFromTurso, type ShopPurgeResult } from "./purgeShopData.server";

const LOG = "[ShopLifecycle]";

export type ArchiveAndPurgeResult = {
  archive: ShopArchiveResult;
  purge: ShopPurgeResult;
};

/**
 * 先归档到 Blob（分析），再从 Turso 真实删除店铺业务数据。
 * PromoClaimLedger 保留。归档失败不阻断删除（合规优先）。
 */
export async function archiveAndPurgeShopData(params: {
  shop: string;
  mode: ShopArchiveMode;
  reason?: string;
}): Promise<ArchiveAndPurgeResult> {
  const shop = params.shop.trim();
  console.info(`${LOG} enter shop=${shop} mode=${params.mode}`);

  const archive = await archiveShopSnapshot({
    shop,
    mode: params.mode,
    reason: params.reason,
  });
  if (!archive.ok) {
    console.warn(
      `${LOG} archive incomplete shop=${shop} error=${archive.error ?? "partial"} — continuing purge`,
    );
  }

  const purge = await purgeShopDataFromTurso(shop);
  console.info(
    `${LOG} done shop=${shop} mode=${params.mode} purgeErrors=${purge.errors.length}`,
  );
  return { archive, purge };
}
