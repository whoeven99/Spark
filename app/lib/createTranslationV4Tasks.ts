import {
  normalizeTargetLocales,
  validateTargetLocales,
} from "./translationTargetLocales";
import type { ShopLocaleOption } from "./productImproveLocales";

export type CreateTranslationV4TasksParams = {
  search: string;
  source: string;
  targets: string[];
  modules: string[];
  limitPerType: number;
  isCover?: boolean;
  isHandle?: boolean;
  testMode?: boolean;
  /** 用于单测注入 fetch */
  fetchFn?: typeof fetch;
  targetOptions?: ShopLocaleOption[];
};

export type CreateTranslationV4TasksResult = {
  created: { target: string; jobId: string }[];
  failed: { target: string; error: string }[];
  /** 校验未通过时无请求 */
  validationError?: string;
};

type ApiResponse = {
  ok?: boolean;
  jobId?: string;
  error?: string;
};

async function createOneTask(
  fetchFn: typeof fetch,
  url: string,
  body: Record<string, unknown>,
  target: string,
): Promise<{ target: string; jobId?: string; error?: string }> {
  try {
    const response = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as ApiResponse;
    if (!response.ok || payload.ok === false) {
      return {
        target,
        error: payload.error || `HTTP ${response.status}`,
      };
    }
    if (!payload.jobId) {
      return { target, error: "Missing jobId" };
    }
    return { target, jobId: payload.jobId };
  } catch {
    return { target, error: "Network error" };
  }
}

/**
 * 为每个目标语言各创建一个 v4 翻译任务（多次 POST，与现有 API 一致）。
 */
export async function createTranslationV4Tasks(
  params: CreateTranslationV4TasksParams,
): Promise<CreateTranslationV4TasksResult> {
  const fetchFn = params.fetchFn ?? fetch;
  const source = params.source.trim();
  const targetOptions = params.targetOptions ?? [];
  const targets = normalizeTargetLocales(
    params.targets,
    targetOptions,
    source,
  );

  const validation = validateTargetLocales(targets, source);
  if (!validation.ok) {
    return { created: [], failed: [], validationError: validation.message };
  }

  const url = `/api/translate/v4/tasks${params.search}`;
  const baseBody = {
    source,
    modules: params.modules,
    limitPerType: params.limitPerType,
    ...(params.isCover !== undefined ? { isCover: params.isCover } : {}),
    ...(params.isHandle !== undefined ? { isHandle: params.isHandle } : {}),
    ...(params.testMode !== undefined ? { testMode: params.testMode } : {}),
  };

  const settled = await Promise.allSettled(
    targets.map((target) =>
      createOneTask(fetchFn, url, { ...baseBody, target }, target),
    ),
  );

  const created: { target: string; jobId: string }[] = [];
  const failed: { target: string; error: string }[] = [];

  for (const entry of settled) {
    if (entry.status === "rejected") {
      continue;
    }
    const r = entry.value;
    if (r.jobId) {
      created.push({ target: r.target, jobId: r.jobId });
    } else {
      failed.push({ target: r.target, error: r.error ?? "Unknown error" });
    }
  }

  return { created, failed };
}
