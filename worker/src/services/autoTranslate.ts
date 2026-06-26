import { randomUUID } from "node:crypto";
import {
  createJob,
  countShopActiveJobs,
  hasActiveJobForTarget,
  TSF_AUTO_TASK_SOURCE,
} from "./cosmosV4.js";
import { pushHint } from "./redisV4.js";
import {
  hasTsfDbCredentials,
  listAutoTranslateShops,
  getOfflineAccessTokenFromTsf,
} from "./tsfDb.js";
import { AUTO_TRANSLATE_V4_MODULES } from "./moduleCatalog.js";
import { setAutoScanLastAt } from "./redisV4.js";
import { resolveNextClockAlignedScanAt } from "./autoScanSchedule.js";

/** 自动任务模块（不含 EMAIL_TEMPLATE、ONLINE_STORE_THEME_LOCALE_CONTENT）。 */
const AUTO_MODULES = [...AUTO_TRANSLATE_V4_MODULES];

/** 本档扫描每店最多新建几条自动任务（店内有进行中任务时用于排队）。 */
const AUTO_MAX_NEW_PER_SHOP_PER_SCAN = (() => {
  const n = Number(process.env.AUTO_TRANSLATE_MAX_NEW_PER_SHOP_PER_SCAN);
  return n > 0 ? Math.floor(n) : 1;
})();

function autoAiModel(): string {
  // 配了 Gpt_ApiKey 时自动翻译默认走 GPT，否则回退 DeepSeek。
  if (process.env.Gpt_ApiKey?.trim()) {
    return process.env.Gpt_Model?.trim() || "gpt-4.1-nano";
  }
  return process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash";
}

/**
 * 扫描 TSF 库中「已迁移且开启自动翻译」的店，为每个 shop+target 创建一个
 * 自动更新任务（isCover=false，增量、不覆盖已翻译）。已有进行中任务则跳过。
 * 由 scheduler 整点调用。
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
    const source = primaryLocale?.trim();
    if (!source || !Array.isArray(targets) || targets.length === 0) continue;

    const shopActiveCount = await countShopActiveJobs(shop);
    let createdThisShop = 0;
    let shopQueued = 0;

    let token: string | null = null;
    for (const rawTarget of targets) {
      const target = String(rawTarget).trim();
      if (!target || target === source) continue;

      if (await hasActiveJobForTarget(shop, source, target)) {
        skipped++;
        continue;
      }

      if (
        shopActiveCount > 0 &&
        createdThisShop >= AUTO_MAX_NEW_PER_SHOP_PER_SCAN
      ) {
        queued++;
        shopQueued++;
        continue;
      }

      // 懒解析 token：只有真要建任务时才查一次
      if (token === null) {
        token = (await getOfflineAccessTokenFromTsf(shop)) ?? "";
        if (!token) {
          console.warn(`[autoTranslate] ${shop} 在 TSF 无 offline token，跳过该店`);
          break;
        }
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

    if (shopQueued > 0 && shopActiveCount > 0) {
      console.log(
        `[autoTranslate] shop=${shop} 已有 ${shopActiveCount} 个进行中任务，本档 ${shopQueued} 个语言排队至下次整点`,
      );
    }
  }

  console.log(
    `[autoTranslate] 扫描完成：店=${shops.length} 新建=${created} 跳过(已有进行中)=${skipped} 排队(本档已满)=${queued}`,
  );
  await setAutoScanLastAt(resolveNextClockAlignedScanAt().toISOString());
}
