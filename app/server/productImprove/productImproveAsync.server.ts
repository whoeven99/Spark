import { getAppEntry } from "../../config/appEntry.server";
import {
  parseUsageMetadata,
  normalizeBillingModelKey,
  recordBilledTokenUsage,
} from "../tokenUsage/index.server";
import { invokeDescriptionModels } from "./descriptionAiClient.server";
import { parseAndValidateProductDescriptionJson } from "./generatedDescriptionJson.server";
import { logDetailedError } from "./generateDescriptionLog.server";
import {
  buildDescriptionSystemPrompt,
  buildDescriptionUserPrompt,
} from "./prompts/generateDescriptionPrompt";
import type { ProductDescriptionContext } from "./productContextFetcher.server";
import {
  appendLog,
  failTask,
  pendingReviewTask,
} from "../aiTask/aiTaskLogger.server";
import { DEFAULT_DESCRIPTION_TEMPERATURE } from "./constants.server";

const LOG_PREFIX = "[ProductImprove][Async]";

export function enqueueProductImproveTask(params: {
  taskId: string;
  shop: string;
  context: ProductDescriptionContext;
  targetLanguage: string;
  temperature?: number;
}): void {
  void runProductImproveTask(params).catch((e) => {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(
      `${LOG_PREFIX} unhandled taskId=${params.taskId} detail=${detail}`,
    );
    void failTask({
      taskId: params.taskId,
      errorMsg: detail || "商品文案生成任务异常终止",
      startedAt: Date.now(),
    });
  });
}

async function runProductImproveTask(params: {
  taskId: string;
  shop: string;
  context: ProductDescriptionContext;
  targetLanguage: string;
  temperature?: number;
}): Promise<void> {
  const startedAt = Date.now();
  const { taskId, shop, context, targetLanguage } = params;

  console.info(`${LOG_PREFIX} start taskId=${taskId} shop=${shop}`);

  await appendLog({ taskId, startedAt, message: "任务开始" });
  await appendLog({ taskId, startedAt, message: "已读取商品标题、描述与语言信息" });
  await appendLog({ taskId, startedAt, message: "开始提炼高转化卖点，并对原文结构进行压缩..." });

  const systemPrompt = buildDescriptionSystemPrompt();
  const userPrompt = buildDescriptionUserPrompt(context, targetLanguage);
  const temperature = params.temperature ?? DEFAULT_DESCRIPTION_TEMPERATURE;

  let raw: { rawText: string; modelLabel: string; usageMeta?: unknown };
  try {
    await appendLog({ taskId, startedAt, message: "正在生成新的标题草稿，保持关键词自然出现..." });
    raw = await invokeDescriptionModels(systemPrompt, userPrompt, temperature, taskId);
    await appendLog({ taskId, startedAt, message: "正在补充描述段落，并准备输出结果摘要..." });
  } catch (e) {
    logDetailedError(`${LOG_PREFIX} taskId=${taskId}`, "invokeDescriptionModels failed", e);
    const msg = e instanceof Error ? e.message : "模型调用失败";
    await failTask({ taskId, errorMsg: msg, startedAt, finalMessage: `文案生成失败：${msg}` });
    return;
  }

  let description: string;
  try {
    const aiPayload = parseAndValidateProductDescriptionJson(raw.rawText);
    description = aiPayload.description;
  } catch (e) {
    logDetailedError(`${LOG_PREFIX} taskId=${taskId}`, "parseAndValidate failed", e);
    const msg = e instanceof Error ? e.message : "AI 输出结构异常";
    await failTask({ taskId, errorMsg: msg, startedAt, finalMessage: `输出解析失败：${msg}` });
    return;
  }

  await pendingReviewTask({
    taskId,
    result: {
      title: context.title,
      description,
    },
    finalMessage: "文案已生成，等待审查",
  });

  // Record billing
  try {
    const usage = parseUsageMetadata(raw.usageMeta);
    if (usage.totalTokens > 0) {
      await recordBilledTokenUsage({
        shop,
        appName: getAppEntry(),
        feature: "product_copy",
        modelKey: normalizeBillingModelKey(raw.modelLabel),
        usage,
      });
    }
  } catch (e) {
    console.error(`${LOG_PREFIX} billing failed taskId=${taskId}`, e);
  }

  console.info(
    `${LOG_PREFIX} ok taskId=${taskId} elapsedMs=${Date.now() - startedAt}`,
  );
}
