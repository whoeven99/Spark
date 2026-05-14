import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { extractMessageText } from "../ai/utils/langchainMessageText";
import { logDetailedError } from "./generateDescriptionLog.server";

const LOG_PREFIX = "[DescriptionAiClient]";

export type DescriptionAiInvokeSuccess = {
  rawText: string;
  modelLabel: string;
  usageMeta?: unknown;
};

function createDeepSeekModel(temperature: number): ChatOpenAI | null {
  console.info(
    `${LOG_PREFIX} 初始化 DeepSeek（LangChain ChatOpenAI）temperature=${temperature}`,
  );
  if (!process.env.DEEPSEEK_API_KEY) {
    console.info(
      `${LOG_PREFIX} 未设置 DEEPSEEK_API_KEY，跳过 DeepSeek 客户端创建`,
    );
    return null;
  }
  return new ChatOpenAI({
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
    temperature,
    apiKey: process.env.DEEPSEEK_API_KEY,
    configuration: {
      baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1",
    },
  });
}

/** 主模型：OpenAI 兼容官方 API，经 LangChain ChatOpenAI 调用。 */
function createOpenAiPrimaryModel(temperature: number): ChatOpenAI | null {
  console.info(
    `${LOG_PREFIX} 初始化主模型 OpenAI 兼容通道（LangChain ChatOpenAI）temperature=${temperature}`,
  );
  if (!process.env.OPENAI_API_KEY) {
    console.info(
      `${LOG_PREFIX} 未设置 OPENAI_API_KEY，跳过主模型（OpenAI 兼容）客户端创建`,
    );
    return null;
  }
  return new ChatOpenAI({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    temperature,
    apiKey: process.env.OPENAI_API_KEY,
  });
}

function modelLabel(model: ChatOpenAI): string {
  return model.model ?? "unknown";
}

async function invokeLangChainOnce(
  model: ChatOpenAI,
  systemPrompt: string,
  userPrompt: string,
  stageTag: string,
): Promise<DescriptionAiInvokeSuccess> {
  console.info(
    `${LOG_PREFIX} [${stageTag}] LangChain model.invoke 开始 model=${modelLabel(model)} systemLen=${systemPrompt.length} userLen=${userPrompt.length}`,
  );
  const result = await model.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt),
  ]);
  const rawText = extractMessageText(result).trim();
  const usageMeta =
    result && typeof result === "object" && "usage_metadata" in result
      ? (result as { usage_metadata?: unknown }).usage_metadata
      : undefined;
  console.info(
    `${LOG_PREFIX} [${stageTag}] LangChain model.invoke 成功 model=${modelLabel(model)} rawTextLen=${rawText.length} usageMeta=${usageMeta !== undefined ? "有" : "无"}`,
  );
  return { rawText, modelLabel: modelLabel(model), usageMeta };
}

async function invokeLangChainWithRetries(
  model: ChatOpenAI,
  systemPrompt: string,
  userPrompt: string,
  retries: number,
  stageTag: string,
): Promise<DescriptionAiInvokeSuccess> {
  console.info(
    `${LOG_PREFIX} [${stageTag}] 开始 LangChain 重试链路 model=${modelLabel(model)} 最大尝试次数=${retries}`,
  );
  let lastError: unknown;
  for (let i = 0; i < retries; i += 1) {
    const attemptTag = `${stageTag} 第 ${i + 1}/${retries} 次`;
    try {
      const out = await invokeLangChainOnce(
        model,
        systemPrompt,
        userPrompt,
        attemptTag,
      );
      console.info(
        `${LOG_PREFIX} [${attemptTag}] 调用成功，结束本阶段重试`,
      );
      return out;
    } catch (e) {
      lastError = e;
      console.info(
        `${LOG_PREFIX} [${attemptTag}] LangChain 调用失败，将${i + 1 < retries ? "继续同模型重试" : "结束本阶段"}`,
      );
      logDetailedError(LOG_PREFIX, `[${attemptTag}] 失败详情`, e);
    }
  }
  console.info(
    `${LOG_PREFIX} [${stageTag}] LangChain 本阶段已耗尽全部 ${retries} 次尝试，均失败`,
  );
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * 使用 LangChain 官方 Chat 模型（ChatOpenAI）依次调用：
 * - 若配置了 OPENAI_API_KEY：主链路为 OpenAI 兼容模型，失败重试后仍失败则（若配置了 DeepSeek）fallback 到 DeepSeek；
 * - 若仅配置 DeepSeek：仅走 DeepSeek 主链路（同 LangChain），无第二提供商可降；
 * - 同阶段内对同一模型最多尝试 2 次（满足「失败后再调一次 LangChain」）。
 */
export async function invokeDescriptionModels(
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  requestId?: string,
): Promise<DescriptionAiInvokeSuccess> {
  const invokeStart = Date.now();
  const rid = requestId ?? "(no-requestId)";
  console.info(
    `${LOG_PREFIX} [LLM Request] requestId=${rid} invokeDescriptionModels 开始（LangChain ChatOpenAI.invoke）`,
  );

  const openaiPrimary = createOpenAiPrimaryModel(temperature);
  const deepseek = createDeepSeekModel(temperature);

  if (!openaiPrimary && !deepseek) {
    console.info(
      `${LOG_PREFIX} requestId=${rid} 失败：未配置 OPENAI_API_KEY 或 DEEPSEEK_API_KEY`,
    );
    throw new Error("未配置 DEEPSEEK_API_KEY 或 OPENAI_API_KEY");
  }

  const LANGCHAIN_PRIMARY_RETRIES = 2;

  if (openaiPrimary) {
    console.info(
      `${LOG_PREFIX} 主策略：优先使用 OpenAI 兼容主模型（LangChain），model=${modelLabel(openaiPrimary)}`,
    );
    try {
      const primaryResult = await invokeLangChainWithRetries(
        openaiPrimary,
        systemPrompt,
        userPrompt,
        LANGCHAIN_PRIMARY_RETRIES,
        "主模型-OpenAI兼容",
      );
      console.info(
        `${LOG_PREFIX} 主模型（OpenAI 兼容）LangChain 链路成功，总耗时 ${Date.now() - invokeStart} ms`,
      );
      return primaryResult;
    } catch (primaryError) {
      logDetailedError(
        LOG_PREFIX,
        "主模型（OpenAI 兼容）LangChain 链路在重试后仍失败",
        primaryError,
      );
      if (!deepseek) {
        console.info(
          `${LOG_PREFIX} 无 DeepSeek 配置，无法进行兜底；总耗时 ${Date.now() - invokeStart} ms`,
        );
        throw primaryError;
      }
      console.info(
        `${LOG_PREFIX} 将进入 DeepSeek 兜底链路（仍为 LangChain ChatOpenAI），model=${modelLabel(deepseek)}`,
      );
      try {
        const fallbackResult = await invokeLangChainWithRetries(
          deepseek,
          systemPrompt,
          userPrompt,
          LANGCHAIN_PRIMARY_RETRIES,
          "兜底-DeepSeek",
        );
        console.info(
          `${LOG_PREFIX} DeepSeek 兜底 LangChain 链路成功，总耗时 ${Date.now() - invokeStart} ms`,
        );
        return fallbackResult;
      } catch (deepseekError) {
        logDetailedError(
          LOG_PREFIX,
          "DeepSeek 兜底 LangChain 链路在重试后仍失败",
          deepseekError,
        );
        console.info(
          `${LOG_PREFIX} 主模型与 DeepSeek 兜底均失败，总耗时 ${Date.now() - invokeStart} ms`,
        );
        throw deepseekError;
      }
    }
  }

  console.info(
    `${LOG_PREFIX} 当前未配置 OPENAI_API_KEY，仅使用 DeepSeek 作为唯一 LangChain 通道 model=${modelLabel(deepseek!)}`,
  );
  const onlyDeepseek = await invokeLangChainWithRetries(
    deepseek!,
    systemPrompt,
    userPrompt,
    LANGCHAIN_PRIMARY_RETRIES,
    "唯一通道-DeepSeek",
  );
  console.info(
    `${LOG_PREFIX} DeepSeek 唯一通道 LangChain 调用成功，总耗时 ${Date.now() - invokeStart} ms`,
  );
  return onlyDeepseek;
}
