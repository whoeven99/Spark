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
} from "./tsfDb.js";
import { AUTO_TRANSLATE_V4_MODULES } from "./moduleCatalog.js";
import { setAutoScanLastAt } from "./redisV4.js";

/** 自动任务默认模块（对齐 v2 TaskService.AUTO_TRANSLATE_MAP）。 */
const AUTO_MODULES = [...AUTO_TRANSLATE_V4_MODULES];

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
 * 由 scheduler 定时调用。
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
  for (const { shop, primaryLocale, targets } of shops) {
    const source = primaryLocale?.trim();
    if (!source || !Array.isArray(targets) || targets.length === 0) continue;

    let token: string | null = null;
    for (const rawTarget of targets) {
      const target = String(rawTarget).trim();
      if (!target || target === source) continue;

      if (await hasActiveJobForTarget(shop, source, target)) {
        skipped++;
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
          taskType: "auto",
        });
        await pushHint("init", { taskId: jobId, shopName: shop });
        created++;
        console.log(
          `[autoTranslate] 建任务 id=${jobId} shop=${shop} ${source}→${target}`,
        );
      } catch (err) {
        console.error(`[autoTranslate] 建任务失败 shop=${shop} ${source}→${target}`, err);
      }
    }
  }

  console.log(
    `[autoTranslate] 扫描完成：店=${shops.length} 新建=${created} 跳过(已有进行中)=${skipped}`,
  );
  await setAutoScanLastAt(new Date().toISOString());
}
