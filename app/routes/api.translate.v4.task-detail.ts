import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  BASE_RESPONSE_FAILED_CODE,
  buildSparkTranslationTaskDetailEnvelope,
} from "../server/translation/translationTaskDetail.server";
import {
  effectiveShopFromQuery,
  forbiddenIfShopMismatch,
} from "../server/translation/translateRouteHelpers.server";

const DEFAULT_AGENT_BASE = "https://agent-task-0qi3.onrender.com";

function coerceEnvelopeSuccess(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return undefined;
}

/** 转发至 AgentTask GET /translate/v3/jsonRuntimeTaskDetail（Java 路径暂未改） */
async function proxyTranslationTaskDetailFromAgentTask(
  requestUrl: URL,
  effectiveShop: string,
  taskId: string,
) {
  const baseRaw = process.env.AGENT_TASK_BASE_URL?.trim() || DEFAULT_AGENT_BASE;
  const base = baseRaw.replace(/\/+$/, "");
  const agentUrl = new URL(`${base}/translate/v3/jsonRuntimeTaskDetail`);
  agentUrl.searchParams.set("taskId", taskId);
  agentUrl.searchParams.set("shopName", effectiveShop);

  const redisPrefix = requestUrl.searchParams.get("redisPrefix")?.trim();
  if (redisPrefix) {
    agentUrl.searchParams.set("redisPrefix", redisPrefix);
  }

  const includeBlobPreview = requestUrl.searchParams.get("includeBlobPreview");
  if (includeBlobPreview === "true" || includeBlobPreview === "false") {
    agentUrl.searchParams.set("includeBlobPreview", includeBlobPreview);
  }

  const maxPreviewBytes = requestUrl.searchParams.get("maxPreviewBytes")?.trim();
  if (maxPreviewBytes) {
    agentUrl.searchParams.set("maxPreviewBytes", maxPreviewBytes);
  }

  const upstream = await fetch(agentUrl.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(60_000),
  });

  const contentType = upstream.headers.get("content-type") ?? "";
  const rawText = await upstream.text();
  const trimmed = rawText.trim();

  if (upstream.status === 204 || trimmed === "") {
    const hint204 =
      upstream.status === 204
        ? "AgentTask 返回 HTTP 204（空响应）。请确认已部署 JsonRuntimeTaskDetailController。"
        : `AgentTask 返回空响应体（HTTP ${upstream.status}）`;
    return Response.json(
      {
        success: false,
        errorCode: upstream.status || 502,
        errorMsg: hint204,
        response: null,
      },
      { status: 502 },
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const snippet = trimmed.slice(0, 280).replace(/\s+/g, " ");
    return Response.json(
      {
        success: false,
        errorCode: upstream.status || 502,
        errorMsg: `上游 body 非 JSON（Content-Type: ${contentType || "未知"}）：${snippet}${trimmed.length > 280 ? "…" : ""}`,
        response: null,
      },
      { status: 502 },
    );
  }

  const coerced = coerceEnvelopeSuccess(parsed.success);
  if (coerced === undefined) {
    const snippet = trimmed.slice(0, 200).replace(/\s+/g, " ");
    return Response.json(
      {
        success: false,
        errorCode: upstream.status || 502,
        errorMsg: `上游 JSON 缺少布尔语义 success 字段（片段：${snippet}${trimmed.length > 200 ? "…" : ""}）`,
        response: null,
      },
      { status: 502 },
    );
  }

  return Response.json(
    { ...parsed, success: coerced },
    { status: upstream.ok ? 200 : upstream.status },
  );
}

function taskDetailSource(): string | undefined {
  return (
    process.env.TRANSLATION_TASK_DETAIL_SOURCE?.trim().toLowerCase() ||
    process.env.JSON_RUNTIME_TASK_DETAIL_SOURCE?.trim().toLowerCase()
  );
}

/**
 * 默认转发 AgentTask；TRANSLATION_TASK_DETAIL_SOURCE=local 时 Spark 本机聚合。
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    const url = new URL(request.url);
    const taskId = url.searchParams.get("taskId")?.trim() ?? "";
    if (!taskId) {
      return Response.json(
        {
          success: false,
          errorCode: BASE_RESPONSE_FAILED_CODE,
          errorMsg: "Missing parameters: taskId",
          response: null,
        },
        { status: 200 },
      );
    }

    const shopNameParam = url.searchParams.get("shopName")?.trim();
    const forbidden = forbiddenIfShopMismatch(
      shopNameParam,
      session.shop,
      "只能查询当前店铺的翻译任务",
    );
    if (forbidden) return forbidden;

    const effectiveShop = effectiveShopFromQuery(shopNameParam, session.shop);

    const includeBlobPreview = url.searchParams.get("includeBlobPreview") === "true";
    const maxPreviewBytesRaw = url.searchParams.get("maxPreviewBytes")?.trim();
    const maxPreviewBytes = maxPreviewBytesRaw
      ? Number(maxPreviewBytesRaw) || 8192
      : 8192;
    const redisPrefix = url.searchParams.get("redisPrefix")?.trim();

    if (taskDetailSource() === "local") {
      try {
        const envelope = await buildSparkTranslationTaskDetailEnvelope({
          taskId,
          shopName: effectiveShop,
          redisPrefix,
          includeBlobPreview,
          maxPreviewBytes,
        });
        return Response.json(
          {
            success: envelope.success,
            errorCode: envelope.errorCode,
            errorMsg: envelope.errorMsg ?? "",
            response: envelope.response,
          },
          { status: 200 },
        );
      } catch (aggregateErr) {
        const msg =
          aggregateErr instanceof Error ? aggregateErr.message : String(aggregateErr);
        console.error("[TranslationTaskDetail] local aggregate failed", aggregateErr);
        return Response.json(
          {
            success: false,
            errorCode: BASE_RESPONSE_FAILED_CODE,
            errorMsg: `任务详情聚合失败：${msg}`,
            response: null,
          },
          { status: 200 },
        );
      }
    }

    return proxyTranslationTaskDetailFromAgentTask(url, effectiveShop, taskId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "请求处理失败";
    return Response.json(
      {
        success: false,
        errorCode: 500,
        errorMsg: message,
        response: null,
      },
      { status: 500 },
    );
  }
};
