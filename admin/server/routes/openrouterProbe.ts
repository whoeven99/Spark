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
  init: RequestInit & { apiKey: string; timeoutMs?: number },
): Promise<{ status: number; body: unknown }> {
  const { apiKey, timeoutMs = 90_000, ...rest } = init;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
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

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function estimateBase64Bytes(b64: string): number {
  const cleaned = b64.replace(/\s/g, "");
  const padding = cleaned.endsWith("==") ? 2 : cleaned.endsWith("=") ? 1 : 0;
  return Math.floor((cleaned.length * 3) / 4) - padding;
}

function normalizeImageDataUrl(params: {
  imageUrl?: string;
  imageBase64?: string;
  mimeType?: string;
}): { ok: true; url: string } | { ok: false; error: string } {
  const imageUrl = typeof params.imageUrl === "string" ? params.imageUrl.trim() : "";
  const imageBase64 = typeof params.imageBase64 === "string" ? params.imageBase64.trim() : "";
  const mimeType =
    typeof params.mimeType === "string" && params.mimeType.trim()
      ? params.mimeType.trim().toLowerCase()
      : "image/png";

  if (imageUrl && imageBase64) {
    return { ok: false, error: "imageUrl 与 imageBase64 只能传其一" };
  }
  if (!imageUrl && !imageBase64) {
    return { ok: false, error: "缺少 imageUrl 或 imageBase64" };
  }

  if (imageUrl) {
    if (/^https:\/\//i.test(imageUrl)) {
      if (imageUrl.length > 200_000) {
        return { ok: false, error: "imageUrl 过长" };
      }
      return { ok: true, url: imageUrl };
    }
    if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(imageUrl)) {
      const comma = imageUrl.indexOf(",");
      const b64 = comma >= 0 ? imageUrl.slice(comma + 1) : "";
      if (!b64 || estimateBase64Bytes(b64) > MAX_IMAGE_BYTES) {
        return { ok: false, error: "图片过大（上限 8MB）" };
      }
      return { ok: true, url: imageUrl };
    }
    return { ok: false, error: "imageUrl 必须为 HTTPS 或 data:image/*;base64,..." };
  }

  if (!mimeType.startsWith("image/")) {
    return { ok: false, error: "mimeType 必须为 image/*" };
  }
  const raw = imageBase64.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "");
  if (!raw || estimateBase64Bytes(raw) > MAX_IMAGE_BYTES) {
    return { ok: false, error: "图片过大（上限 8MB）或不完整" };
  }
  return { ok: true, url: `data:${mimeType};base64,${raw}` };
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
      modality: m.architecture?.modality ?? null,
      output_modalities: Array.isArray(m.architecture?.output_modalities)
        ? m.architecture.output_modalities
        : null,
    }));

    res.json({ total_count, models, modalities });
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

/** Forward a single-step image generation / img2img request (no persistence). */
openrouterProbeRouter.post("/images", async (req, res) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    res.status(503).json({ error: "未配置 OPENROUTER_API_KEY" });
    return;
  }

  const model = typeof req.body?.model === "string" ? req.body.model.trim() : "";
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt : "";
  const resolution =
    typeof req.body?.resolution === "string" ? req.body.resolution.trim() : "";
  const outputFormat =
    typeof req.body?.output_format === "string"
      ? req.body.output_format.trim().toLowerCase()
      : "";
  const aspectRatio =
    typeof req.body?.aspect_ratio === "string"
      ? req.body.aspect_ratio.trim()
      : "";

  if (!model) {
    res.status(400).json({ error: "缺少 model" });
    return;
  }
  if (!prompt.trim()) {
    res.status(400).json({ error: "缺少 prompt" });
    return;
  }
  if (prompt.length > 20_000) {
    res.status(400).json({ error: "prompt 过长（上限 20000 字符）" });
    return;
  }

  const imageNorm = normalizeImageDataUrl({
    imageUrl: typeof req.body?.imageUrl === "string" ? req.body.imageUrl : undefined,
    imageBase64:
      typeof req.body?.imageBase64 === "string" ? req.body.imageBase64 : undefined,
    mimeType: typeof req.body?.mimeType === "string" ? req.body.mimeType : undefined,
  });
  if (!imageNorm.ok) {
    res.status(400).json({ error: imageNorm.error });
    return;
  }

  const payload: Record<string, unknown> = {
    model,
    prompt,
    input_references: [{ image_url: { url: imageNorm.url } }],
    n: 1,
  };
  if (resolution) payload.resolution = resolution;
  if (
    outputFormat === "png" ||
    outputFormat === "jpeg" ||
    outputFormat === "webp" ||
    outputFormat === "svg"
  ) {
    payload.output_format = outputFormat;
  }
  if (aspectRatio) payload.aspect_ratio = aspectRatio;

  try {
    const { status, body } = await fetchOpenRouter("/images", {
      method: "POST",
      apiKey,
      timeoutMs: 180_000,
      body: JSON.stringify(payload),
    });

    const errObj = (body as { error?: { message?: string; code?: number; metadata?: unknown } })
      ?.error;
    const usage = (body as { usage?: Record<string, unknown> })?.usage ?? null;
    const modelUsed =
      typeof (body as { model?: unknown }).model === "string"
        ? ((body as { model: string }).model)
        : null;
    const rawImages =
      (body as {
        data?: Array<{ b64_json?: string; url?: string; media_type?: string }>;
      })?.data ?? [];

    const images = rawImages
      .map((item) => {
        const b64 =
          typeof item.b64_json === "string" && item.b64_json.trim()
            ? item.b64_json.trim()
            : null;
        const url =
          typeof item.url === "string" && item.url.trim() ? item.url.trim() : null;
        const mimeType =
          typeof item.media_type === "string" && item.media_type.trim()
            ? item.media_type.trim()
            : b64
              ? outputFormat === "jpeg"
                ? "image/jpeg"
                : outputFormat === "webp"
                  ? "image/webp"
                  : outputFormat === "svg"
                    ? "image/svg+xml"
                    : "image/png"
              : null;
        if (!b64 && !url) return null;
        return { b64, url, mimeType };
      })
      .filter((x): x is { b64: string | null; url: string | null; mimeType: string | null } =>
        Boolean(x),
      );

    res.json({
      ok: status >= 200 && status < 300 && !errObj && images.length > 0,
      httpStatus: status,
      model,
      modelUsed,
      images,
      usage,
      error: errObj
        ? {
            code: errObj.code ?? status,
            message: errObj.message ?? `HTTP ${status}`,
            metadata: errObj.metadata ?? null,
          }
        : status >= 400
          ? { code: status, message: `OpenRouter HTTP ${status}`, metadata: null }
          : status >= 200 && status < 300 && images.length === 0
            ? {
                code: status,
                message: "上游未返回图片数据（模型可能不支持参考图/译图）",
                metadata: null,
              }
            : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({ error: `调用 OpenRouter Images 失败：${msg}` });
  }
});
