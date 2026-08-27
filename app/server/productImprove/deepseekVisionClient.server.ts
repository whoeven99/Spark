import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { extractMessageText } from "../ai/utils/langchainMessageText";
import { logDetailedError } from "./generateDescriptionLog.server";

const LOG_PREFIX = "[DeepSeekVision]";

export const DEFAULT_DEEPSEEK_VISION_MODEL = "deepseek-v4-flash-vision-exp";

export type VisionImageInput = {
  url: string;
  altText?: string;
};

export type DeepSeekVisionInvokeSuccess = {
  rawText: string;
  modelLabel: string;
  usageMeta?: unknown;
};

function resolveVisionModelName(): string {
  return (
    process.env.DEEPSEEK_VISION_MODEL?.trim() ||
    DEFAULT_DEEPSEEK_VISION_MODEL
  );
}

function resolveVisionApiKey(): string | null {
  const key = process.env.DEEPSEEK_VISION_KEY?.trim();
  return key || null;
}

function createDeepSeekVisionModel(temperature: number): ChatOpenAI | null {
  const apiKey = resolveVisionApiKey();
  if (!apiKey) {
    console.info(`${LOG_PREFIX} 未设置 DEEPSEEK_VISION_KEY，跳过 Vision 客户端`);
    return null;
  }

  const model = resolveVisionModelName();
  console.info(
    `${LOG_PREFIX} 初始化 Vision model=${model} temperature=${temperature}`,
  );

  return new ChatOpenAI({
    model,
    temperature,
    apiKey,
    configuration: {
      baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1",
    },
  });
}

/**
 * 调用 DeepSeek 官方 Vision 模型（看图理解，非文生图）。
 * 图片以公开 URL 传入（Shopify CDN 通常可直接访问）。
 */
export async function invokeDeepSeekVision(params: {
  systemPrompt: string;
  userText: string;
  images: VisionImageInput[];
  temperature?: number;
  requestId?: string;
}): Promise<DeepSeekVisionInvokeSuccess> {
  const {
    systemPrompt,
    userText,
    images,
    temperature = 0.2,
    requestId,
  } = params;
  const rid = requestId ?? "-";

  const model = createDeepSeekVisionModel(temperature);
  if (!model) {
    throw new Error("未配置 DEEPSEEK_VISION_KEY，无法调用 Vision 模型");
  }

  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [{ type: "text", text: userText }];

  for (const image of images) {
    const url = image.url.trim();
    if (!url) continue;
    content.push({
      type: "image_url",
      image_url: { url },
    });
  }

  if (content.length === 1) {
    throw new Error("Vision 调用缺少有效图片 URL");
  }

  console.info(
    `${LOG_PREFIX} requestId=${rid} invoke start model=${model.model ?? "unknown"} imageCount=${content.length - 1}`,
  );

  try {
    const result = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage({ content }),
    ]);
    const rawText = extractMessageText(result).trim();
    const usageMeta =
      result && typeof result === "object" && "usage_metadata" in result
        ? (result as { usage_metadata?: unknown }).usage_metadata
        : undefined;

    console.info(
      `${LOG_PREFIX} requestId=${rid} invoke ok rawTextLen=${rawText.length}`,
    );
    return {
      rawText,
      modelLabel: model.model ?? resolveVisionModelName(),
      usageMeta,
    };
  } catch (e) {
    logDetailedError(LOG_PREFIX, `requestId=${rid} invoke failed`, e);
    throw e;
  }
}

export function isDeepSeekVisionConfigured(): boolean {
  return Boolean(resolveVisionApiKey());
}
