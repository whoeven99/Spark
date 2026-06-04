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
      params: sanitizeAITaskMessageParams(parsed.params),
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

export function sanitizeAITaskMessageParams(input: unknown): AITaskMessageParams | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;

  const sanitized: AITaskMessageParams = {};
  for (const [key, value] of Object.entries(input)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      sanitized[key] = value;
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export function safeTranslateAITaskMessage(params: {
  t: (key: string, options?: Record<string, unknown>) => string;
  message: string;
  messageKey?: string;
  messageParams?: unknown;
}): string {
  const safeParams = sanitizeAITaskMessageParams(params.messageParams);
  if (!params.messageKey) return params.message;

  try {
    const translated = params.t(params.messageKey, safeParams);
    return typeof translated === "string" && translated.trim()
      ? translated
      : params.message;
  } catch {
    return params.message;
  }
}
