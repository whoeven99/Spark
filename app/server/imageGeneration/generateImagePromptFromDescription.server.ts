import { invokeDescriptionModels } from "../productImprove/descriptionAiClient.server";
import { logDetailedError } from "../productImprove/generateDescriptionLog.server";
import {
  IMAGE_GENERATION_LOG_PREFIX,
  MAX_PROMPT_CHARS,
  MIN_PROMPT_CHARS,
} from "./constants.server";
import { normalizeImageGenerationPrompt } from "./imageGenerationExecutor.server";

const PROMPT_GEN_TEMPERATURE = 0.35;

const SYSTEM_PROMPT = `你是 Shopify 电商商品图提示词专家。商户会用简短中文或英文描述想要的画面，你需要将其改写为适合文生图模型使用的一段提示词。

要求：
- 输出必须可直接用于 AI 绘图，包含主体、构图、背景、光线、风格等可画面化细节；
- 面向电商商品主图/场景图，风格真实、干净，避免夸张虚假承诺；
- 不要输出 Markdown、编号列表、引号包裹或「提示词：」等前缀；
- 只输出一段提示词正文（中文或英文均可，以画面清晰为准）。`;

export const MIN_DESCRIPTION_CHARS = 4;
export const MAX_DESCRIPTION_CHARS = 2000;

export function normalizeImageDescription(description: string): string {
  return description.trim().replace(/\s+/g, " ");
}

export function validateImageDescription(description: string): string | null {
  const normalized = normalizeImageDescription(description);
  if (normalized.length < MIN_DESCRIPTION_CHARS) {
    return `画面描述至少 ${MIN_DESCRIPTION_CHARS} 个字符`;
  }
  if (normalized.length > MAX_DESCRIPTION_CHARS) {
    return `画面描述不能超过 ${MAX_DESCRIPTION_CHARS} 个字符`;
  }
  return null;
}

function stripPromptArtifacts(raw: string): string {
  let text = raw.trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1).trim();
  }
  text = text.replace(/^提示词[：:]\s*/i, "").trim();
  return text;
}

export type GenerateImagePromptResult =
  | { ok: true; prompt: string; modelLabel: string; usageMeta?: unknown }
  | { ok: false; errorMsg: string };

export async function generateImagePromptFromDescription(params: {
  description: string;
  requestId: string;
}): Promise<GenerateImagePromptResult> {
  const validationError = validateImageDescription(params.description);
  if (validationError) {
    return { ok: false, errorMsg: validationError };
  }

  const normalizedDescription = normalizeImageDescription(params.description);
  const userPrompt = `商户画面描述：\n${normalizedDescription}`;

  console.info(
    `${IMAGE_GENERATION_LOG_PREFIX}[PromptAi] start requestId=${params.requestId} descriptionLen=${normalizedDescription.length}`,
  );

  try {
    const llm = await invokeDescriptionModels(
      SYSTEM_PROMPT,
      userPrompt,
      PROMPT_GEN_TEMPERATURE,
      params.requestId,
    );

    let prompt = stripPromptArtifacts(llm.rawText);
    prompt = normalizeImageGenerationPrompt(prompt);

    if (prompt.length < MIN_PROMPT_CHARS) {
      return {
        ok: false,
        errorMsg: "AI 生成的提示词过短，请补充画面描述后重试",
      };
    }

    if (prompt.length > MAX_PROMPT_CHARS) {
      prompt = prompt.slice(0, MAX_PROMPT_CHARS).trim();
    }

    console.info(
      `${IMAGE_GENERATION_LOG_PREFIX}[PromptAi] ok requestId=${params.requestId} promptLen=${prompt.length} model=${llm.modelLabel}`,
    );

    return { ok: true, prompt, modelLabel: llm.modelLabel, usageMeta: llm.usageMeta };
  } catch (e) {
    logDetailedError(
      `${IMAGE_GENERATION_LOG_PREFIX}[PromptAi] requestId=${params.requestId}`,
      "generate prompt failed",
      e,
    );
    const msg =
      e instanceof Error ? e.message : "生成提示词失败，请稍后重试";
    if (msg.includes("未配置") && msg.includes("API_KEY")) {
      return {
        ok: false,
        errorMsg: "未配置 AI 模型密钥（DEEPSEEK_API_KEY 或 OPENAI_API_KEY）",
      };
    }
    return { ok: false, errorMsg: msg };
  }
}
