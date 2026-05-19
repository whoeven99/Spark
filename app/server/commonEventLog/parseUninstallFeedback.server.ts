export type UninstallFeedbackSource =
  | "webhook_payload"
  | "webhook_headers"
  | "partner_api";

export type UninstallFeedback = {
  reason: string | null;
  description: string | null;
  source: UninstallFeedbackSource;
};

const REASON_KEYS = [
  "reason",
  "uninstall_reason",
  "uninstallReason",
  "uninstall_reasons",
  "uninstallReasons",
] as const;

const DESCRIPTION_KEYS = [
  "description",
  "uninstall_description",
  "uninstallDescription",
  "feedback",
  "comment",
  "details",
] as const;

const NESTED_KEYS = [
  "relationship_uninstalled",
  "relationshipUninstalled",
  "app_uninstalled",
  "appUninstalled",
  "uninstall_feedback",
  "uninstallFeedback",
] as const;

const HEADER_REASON_KEYS = [
  "x-shopify-uninstall-reason",
  "x-shopify-app-uninstall-reason",
  "x-shopify-uninstall-reasons",
];

const HEADER_DESCRIPTION_KEYS = [
  "x-shopify-uninstall-description",
  "x-shopify-app-uninstall-description",
  "x-shopify-uninstall-feedback",
];

function pickString(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const joined = value
        .filter((item): item is string => typeof item === "string" && item.trim())
        .map((item) => item.trim())
        .join(", ");
      if (joined) return joined;
    }
  }
  return null;
}

function parseRecord(record: Record<string, unknown>): UninstallFeedback | null {
  const reason = pickString(record, REASON_KEYS);
  const description = pickString(record, DESCRIPTION_KEYS);
  if (!reason && !description) return null;
  return { reason, description, source: "webhook_payload" };
}

function deepParse(payload: unknown, depth = 0): UninstallFeedback | null {
  if (!payload || depth > 4) return null;

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const parsed = deepParse(item, depth + 1);
      if (parsed) return parsed;
    }
    return null;
  }

  if (typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;
  const direct = parseRecord(record);
  if (direct) return direct;

  for (const key of NESTED_KEYS) {
    const nested = record[key];
    const parsed = deepParse(nested, depth + 1);
    if (parsed) return parsed;
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      const parsed = deepParse(value, depth + 1);
      if (parsed) return parsed;
    }
  }

  return null;
}

export function parseUninstallFeedbackFromPayload(
  payload: unknown,
): UninstallFeedback | null {
  if (!payload || typeof payload !== "object") {
    if (typeof payload === "string" && payload.trim()) {
      try {
        return parseUninstallFeedbackFromPayload(JSON.parse(payload));
      } catch {
        return null;
      }
    }
    return null;
  }

  return deepParse(payload);
}

function getHeader(headers: Headers, name: string): string | null {
  const value = headers.get(name)?.trim();
  return value || null;
}

export function parseUninstallFeedbackFromHeaders(
  headers: Headers,
): UninstallFeedback | null {
  let reason: string | null = null;
  let description: string | null = null;

  for (const key of HEADER_REASON_KEYS) {
    reason = getHeader(headers, key);
    if (reason) break;
  }

  for (const key of HEADER_DESCRIPTION_KEYS) {
    description = getHeader(headers, key);
    if (description) break;
  }

  if (!reason && !description) return null;
  return { reason, description, source: "webhook_headers" };
}

/** 合并多来源；优先保留已有 reason / description，并记录最终来源。 */
export function mergeUninstallFeedback(
  ...candidates: Array<UninstallFeedback | null | undefined>
): UninstallFeedback | null {
  let reason: string | null = null;
  let description: string | null = null;
  let source: UninstallFeedbackSource | null = null;

  for (const item of candidates) {
    if (!item) continue;
    if (!reason && item.reason) {
      reason = item.reason;
      source = item.source;
    }
    if (!description && item.description) {
      description = item.description;
      source = source ?? item.source;
    }
  }

  if (!reason && !description) return null;
  return {
    reason,
    description,
    source: source ?? "webhook_payload",
  };
}

export function uninstallFeedbackToMetadata(
  feedback: UninstallFeedback | null,
): Record<string, unknown> | undefined {
  if (!feedback) return undefined;
  return {
    uninstallReason: feedback.reason,
    uninstallDescription: feedback.description,
    uninstallFeedbackSource: feedback.source,
  };
}
