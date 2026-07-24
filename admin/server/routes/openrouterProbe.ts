import { Router } from "express";
import { getEnv } from "../lib/env.js";

export const openrouterProbeRouter = Router();

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

type OpenRouterModel = {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { modality?: string; output_modalities?: string[] };
};

function getApiKey(): string | null {
  const key = getEnv("OPENROUTER_API_KEY");
  return key || null;
}

function openRouterHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": getEnv("OPENROUTER_HTTP_REFERER", "https://spark-admin.local"),
    "X-Title": getEnv("OPENROUTER_APP_TITLE", "Spark Admin OpenRouter Probe"),
  };
}

async function fetchOpenRouter(
  path: string,
  init: RequestInit & { apiKey: string },
): Promise<{ status: number; body: unknown }> {
  const { apiKey, ...rest } = init;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 90_000);
  try {
    const res = await fetch(`${OPENROUTER_BASE}${path}`, {
      ...rest,
      headers: {
        ...openRouterHeaders(apiKey),
        ...(rest.headers as Record<string, string> | undefined),
      },
      signal: ac.signal,
    });
    const body = await res.json().catch(() => ({ error: { message: "Invalid JSON from OpenRouter" } }));
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/** Key / credits status (never returns the secret). */
openrouterProbeRouter.get("/status", async (_req, res) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    res.status(503).json({
      configured: false,
      error:
        "未配置 OPENROUTER_API_KEY。请写入 Spark/.env、admin/.env，或 Render secrets。",
    });
    return;
  }

  try {
    const [keyRes, creditsRes] = await Promise.all([
      fetchOpenRouter("/key", { method: "GET", apiKey }),
      fetchOpenRouter("/credits", { method: "GET", apiKey }),
    ]);

    const keyData =
      keyRes.body && typeof keyRes.body === "object" && "data" in keyRes.body
        ? (keyRes.body as { data: Record<string, unknown> }).data
        : null;
    const creditsData =
      creditsRes.body &&
      typeof creditsRes.body === "object" &&
      "data" in creditsRes.body
        ? (creditsRes.body as { data: Record<string, unknown> }).data
        : null;

    res.json({
      configured: true,
      keyStatus: keyRes.status,
      creditsStatus: creditsRes.status,
      key: keyData
        ? {
            is_free_tier: keyData.is_free_tier ?? null,
            limit: keyData.limit ?? null,
            limit_remaining: keyData.limit_remaining ?? null,
            usage: keyData.usage ?? null,
            usage_daily: keyData.usage_daily ?? null,
            expires_at: keyData.expires_at ?? null,
          }
        : null,
      credits: creditsData,
      keyError:
        keyRes.status >= 400
          ? (keyRes.body as { error?: { message?: string } })?.error?.message ??
            `HTTP ${keyRes.status}`
          : null,
      note: "请求从 Admin 服务器出口 IP 发出；海外部署可绕过部分厂商地区限制。",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({ configured: true, error: `探测 OpenRouter 失败：${msg}` });
  }
});

/** List models (text by default; pass modalities=all for everything). */
openrouterProbeRouter.get("/models", async (req, res) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    res.status(503).json({ error: "未配置 OPENROUTER_API_KEY" });
    return;
  }

  const modalities =
    typeof req.query.modalities === "string" && req.query.modalities.trim()
      ? req.query.modalities.trim()
      : "text";
  const qs =
    modalities === "all"
      ? "?output_modalities=all"
      : `?output_modalities=${encodeURIComponent(modalities)}`;

  try {
    const { status, body } = await fetchOpenRouter(`/models${qs}`, {
      method: "GET",
      apiKey,
    });
    if (status >= 400) {
      const message =
        (body as { error?: { message?: string } })?.error?.message ??
        `OpenRouter HTTP ${status}`;
      res.status(status === 401 || status === 403 ? status : 502).json({ error: message });
      return;
    }

    const data = (body as { data?: OpenRouterModel[]; total_count?: number })?.data ?? [];
    const total_count =
      (body as { total_count?: number })?.total_count ?? data.length;

    const models = data.map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
      context_length: m.context_length ?? null,
      pricing: m.pricing
        ? {
            prompt: m.pricing.prompt ?? null,
            completion: m.pricing.completion ?? null,
          }
        : null,
      free: String(m.id).endsWith(":free"),
      provider: String(m.id).split("/")[0] || "unknown",
    }));

    res.json({ total_count, models });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({ error: `拉取模型列表失败：${msg}` });
  }
});

/** Forward a chat completion request. */
openrouterProbeRouter.post("/chat", async (req, res) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    res.status(503).json({ error: "未配置 OPENROUTER_API_KEY" });
    return;
  }

  const model = typeof req.body?.model === "string" ? req.body.model.trim() : "";
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt : "";
  const system =
    typeof req.body?.system === "string" ? req.body.system.trim() : "";
  const maxTokensRaw = Number(req.body?.max_tokens);
  const max_tokens =
    Number.isFinite(maxTokensRaw) && maxTokensRaw > 0
      ? Math.min(Math.floor(maxTokensRaw), 8192)
      : 1024;
  const temperatureRaw = Number(req.body?.temperature);
  const temperature = Number.isFinite(temperatureRaw)
    ? Math.min(Math.max(temperatureRaw, 0), 2)
    : 0.2;

  if (!model) {
    res.status(400).json({ error: "缺少 model" });
    return;
  }
  if (!prompt.trim()) {
    res.status(400).json({ error: "缺少 prompt" });
    return;
  }
  if (prompt.length > 100_000) {
    res.status(400).json({ error: "prompt 过长（上限 100000 字符）" });
    return;
  }

  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  try {
    const { status, body } = await fetchOpenRouter("/chat/completions", {
      method: "POST",
      apiKey,
      body: JSON.stringify({
        model,
        messages,
        max_tokens,
        temperature,
      }),
    });

    const errObj = (body as { error?: { message?: string; code?: number; metadata?: unknown } })
      ?.error;
    const choice = (body as {
      choices?: Array<{
        message?: { content?: string | null; role?: string };
        finish_reason?: string | null;
      }>;
    })?.choices?.[0];
    const usage = (body as { usage?: Record<string, unknown> })?.usage ?? null;
    const modelUsed = (body as { model?: string })?.model ?? null;

    // Always HTTP 200 for upstream model errors so the UI can render region/credit
    // failures without apiFetch treating them as transport failures.
    res.json({
      ok: status >= 200 && status < 300 && !errObj,
      httpStatus: status,
      model,
      modelUsed,
      content: choice?.message?.content ?? null,
      finish_reason: choice?.finish_reason ?? null,
      usage,
      error: errObj
        ? {
            code: errObj.code ?? status,
            message: errObj.message ?? `HTTP ${status}`,
            metadata: errObj.metadata ?? null,
          }
        : status >= 400
          ? { code: status, message: `OpenRouter HTTP ${status}`, metadata: null }
          : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({ error: `调用 OpenRouter 失败：${msg}` });
  }
});
