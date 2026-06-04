export type AITaskMessageParamValue = string | number | boolean | null;
export type AITaskMessageParams = Record<string, AITaskMessageParamValue>;

export type AITaskMessageInput =
  | string
  | {
      key: string;
      fallback: string;
      params?: AITaskMessageParams;
    };

export type AITaskParsedMessage = {
  text: string;
  key?: string;
  params?: AITaskMessageParams;
};

const TASK_MESSAGE_PREFIX = "__spark_i18n_task_message__:";

export function serializeAITaskMessage(input: AITaskMessageInput): string {
  if (typeof input === "string") return input;
  return `${TASK_MESSAGE_PREFIX}${JSON.stringify({
    key: input.key,
    fallback: input.fallback,
    params: input.params ?? undefined,
  })}`;
}

export function parseAITaskMessage(raw: string | null | undefined): AITaskParsedMessage {
  if (!raw) return { text: "" };
  if (!raw.startsWith(TASK_MESSAGE_PREFIX)) return { text: raw };

  try {
    const parsed = JSON.parse(raw.slice(TASK_MESSAGE_PREFIX.length)) as {
      key?: unknown;
      fallback?: unknown;
      params?: unknown;
    };
    return {
      text: typeof parsed.fallback === "string" ? parsed.fallback : raw,
      key: typeof parsed.key === "string" ? parsed.key : undefined,
      params:
        parsed.params && typeof parsed.params === "object" && !Array.isArray(parsed.params)
          ? (parsed.params as AITaskMessageParams)
          : undefined,
    };
  } catch {
    return { text: raw };
  }
}

export function buildAITaskMessage(
  key: string,
  fallback: string,
  params?: AITaskMessageParams,
): AITaskMessageInput {
  return { key, fallback, params };
}
