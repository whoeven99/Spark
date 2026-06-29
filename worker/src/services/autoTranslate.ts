import { randomUUID } from "node:crypto";
import {
  createJob,
  hasActiveJobForTarget,
  TSF_AUTO_TASK_SOURCE,
} from "./cosmosV4.js";
import { pushHint } from "./redisV4.js";
import {
  hasTsfDbCredentials,
  listAutoTranslateShops,
  getOfflineAccessTokenFromTsf,
  syncShopPrimaryLocaleInTsf,
} from "./tsfDb.js";
import { fetchShopPrimaryLocale } from "./shopifyFetch.js";
import { AUTO_TRANSLATE_V4_MODULES } from "./moduleCatalog.js";
import { setAutoScanLastAt } from "./redisV4.js";
import { resolveNextClockAlignedScanAt } from "./autoScanSchedule.js";

/** 自动任务模块（不含 EMAIL_TEMPLATE、ONLINE_STORE_THEME_LOCALE_CONTENT）。 */
const AUTO_MODULES = [...AUTO_TRANSLATE_V4_MODULES];

/** 本档扫描每店最多新建几条自动任务（默认 1，跨整点逐步消化多语言，避免单店占满 init）。 */
const AUTO_MAX_NEW_PER_SHOP_PER_SCAN = (() => {
  const n = Number(process.env.AUTO_TRANSLATE_MAX_NEW_PER_SHOP_PER_SCAN);
  return n > 0 ? Math.floor(n) : 1;
})();

/** v4 自动翻译任务固定使用 GPT-4.1 nano（与 TSF 手动任务默认模型一致）。 */
function autoAiModel(): string {
  return "gpt-4.1-nano";
}

/**
 * 扫描 TSF 库中「已迁移且开启自动翻译」的店，为每个 shop+target 创建
 * 自动更新任务（isCover=false，增量、不覆盖已翻译）。
 * 每店每档最多建 AUTO_TRANSLATE_MAX_NEW_PER_SHOP_PER_SCAN 条（默认 1），
 * 多语言分多个整点逐步建，避免单店一次占满 init worker。
 * 已有进行中同 target 任务则跳过。由 scheduler 整点调用。
 */
export async function runAutoTranslateScan(): Promise<void> {
  if (!hasTsfDbCredentials()) {
    console.log("[autoTranslate] TSF Turso 未配置（TSF_TURSO_*），跳过自动扫描");
    return;
  }

  const shops = await listAutoTranslateShops();
  if (shops.length === 0) {
    console.log("[autoTranslate] 无开启自动翻译的店");
    await setAutoScanLastAt(new Date().toISOString());
    return;
  }

  let created = 0;
  let skipped = 0;
  let queued = 0;
  for (const { shop, primaryLocale, targets } of shops) {
    let source = primaryLocale?.trim();
    if (!source || !Array.isArray(targets) || targets.length === 0) continue;

    const token = (await getOfflineAccessTokenFromTsf(shop)) ?? "";
    if (!token) {
      console.warn(`[autoTranslate] ${shop} 在 TSF 无 offline token，跳过该店`);
      continue;
    }

    try {
      const livePrimary = await fetchShopPrimaryLocale(shop, token, true);
      if (livePrimary) {
        await syncShopPrimaryLocaleInTsf(shop, livePrimary);
        source = livePrimary;
      }
    } catch (err) {
      console.warn(`[autoTranslate] ${shop} 读取 Shopify 默认语言失败，沿用 TSF 缓存`, err);
    }

    let createdThisShop = 0;
    let shopQueued = 0;

    for (const rawTarget of targets) {
      const target = String(rawTarget).trim();
      if (!target || target === source) continue;

      if (await hasActiveJobForTarget(shop, source, target)) {
        skipped++;
        continue;
      }

      if (createdThisShop >= AUTO_MAX_NEW_PER_SHOP_PER_SCAN) {
        queued++;
        shopQueued++;
        continue;
      }

      const jobId = randomUUID();
      try {
        await createJob({
          id: jobId,
          shopName: shop,
          shopifyAccessToken: token,
          source,
          target,
          modules: AUTO_MODULES,
          aiModel: autoAiModel(),
          limitPerType: Number.MAX_SAFE_INTEGER, // 自动任务：抓全量增量内容
          isCover: false, // 自动更新默认不覆盖已翻译
          isHandle: false,
          taskSource: TSF_AUTO_TASK_SOURCE,
          status: "INIT_QUEUED",
          blobPrefix: `tasks/v4/${shop}/${jobId}`,
          createdBy: "auto",
        });
        await pushHint("init", { taskId: jobId, shopName: shop });
        created++;
        createdThisShop++;
        console.log(
          `[autoTranslate] 建任务 id=${jobId} shop=${shop} ${source}→${target}`,
        );
      } catch (err) {
        console.error(`[autoTranslate] 建任务失败 shop=${shop} ${source}→${target}`, err);
      }
    }

    if (shopQueued > 0) {
      console.log(
        `[autoTranslate] shop=${shop} 本档已建 ${createdThisShop} 条（上限 ${AUTO_MAX_NEW_PER_SHOP_PER_SCAN}），${shopQueued} 个语言排队至下次整点`,
      );
    }
  }

  console.log(
    `[autoTranslate] 扫描完成：店=${shops.length} 新建=${created} 跳过(已有进行中)=${skipped} 排队(本档已满)=${queued}`,
  );
  await setAutoScanLastAt(resolveNextClockAlignedScanAt().toISOString());
}
