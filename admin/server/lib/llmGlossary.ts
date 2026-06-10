/**
 * LLM-based glossary term extractor.
 * Reuses the same API keys as the translate worker (DEEPSEEK_API_KEY / OPENAI_API_KEY /
 * OPENAI_API_KEYS / AZURE_OPENAI_*) — no extra config needed.
 */

import type { GlossaryTerm } from "../routes/glossary.js";

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a translation glossary extractor for an e-commerce platform.

Given a document (brand style guide, product glossary, translation memory, spreadsheet, etc.),
extract ALL translation term pairs and special vocabulary entries.

Return a JSON object {"terms": [...]} where each item has:
  "source"          : the original / source-language term (string, required)
  "translations"    : locale → translation map, e.g. {"en":"Flash Sale","zh-CN":"闪购"} (optional)
  "doNotTranslate"  : true if the term must never be translated (brand names, product codes, model numbers) (optional)
  "note"            : brief context note — category, usage, etc. (optional, keep short)

Rules:
- Use standard BCP-47 locale codes: en, zh-CN, zh-TW, ja, ko, de, fr, pl, es, pt-BR …
- If a table or list maps source term → translation(s), extract every row.
- Brand names, trademarks, product names, codes → set doNotTranslate: true, skip translations.
- If the document language is unclear, treat the primary language as the source.
- Deduplicate: if the same source appears multiple times, merge their translations.
- Return ONLY the JSON object — no markdown, no explanations.`;

// ── LLM client ────────────────────────────────────────────────────────────────

type LLMConfig = {
  url: string;
  key: string;
  model: string;
};

function resolveLLM(): LLMConfig | null {
  const deepseek = (process.env.DEEPSEEK_API_KEYS?.split(",")[0] ?? process.env.DEEPSEEK_API_KEY)?.trim();
  if (deepseek) {
    return {
      url:   "https://api.deepseek.com/v1/chat/completions",
      key:   deepseek,
      model: process.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat",
    };
  }
  const openai = (process.env.OPENAI_API_KEYS?.split(",")[0] ?? process.env.OPENAI_API_KEY)?.trim();
  if (openai) {
    return {
      url:   "https://api.openai.com/v1/chat/completions",
      key:   openai,
      model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
    };
  }
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT?.trim();
  const azureKey      = process.env.AZURE_OPENAI_API_KEY?.trim();
  const azureDeploy   = process.env.AZURE_OPENAI_DEPLOYMENT?.trim();
  if (azureEndpoint && azureKey && azureDeploy) {
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION?.trim() || "2024-02-01";
    return {
      url:   `${azureEndpoint}/openai/deployments/${azureDeploy}/chat/completions?api-version=${apiVersion}`,
      key:   azureKey,
      model: azureDeploy,
    };
  }
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Send extracted document text to the LLM and return parsed GlossaryTerm[].
 * Throws when no API key is configured or the LLM returns unusable output.
 */
export async function parseGlossaryWithLLM(documentText: string): Promise<GlossaryTerm[]> {
  const cfg = resolveLLM();
  if (!cfg) {
    throw new Error(
      "未配置 LLM API Key（DEEPSEEK_API_KEY / OPENAI_API_KEY / AZURE_OPENAI_*），无法解析文件",
    );
  }

  const isAzure = cfg.url.includes("openai.azure.com");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(isAzure ? { "api-key": cfg.key } : { Authorization: `Bearer ${cfg.key}` }),
  };

  const body = JSON.stringify({
    model: cfg.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user",   content: documentText   },
    ],
    temperature: 0.1,
    response_format: { type: "json_object" },
  });

  const res = await fetch(cfg.url, { method: "POST", headers, body, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`LLM API 返回 ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content ?? "{}";

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("LLM 返回内容无法解析为 JSON");
  }

  const raw = parsed as Record<string, unknown>;
  if (!Array.isArray(raw.terms)) {
    throw new Error("LLM 返回格式不符（缺少 terms 数组）");
  }

  // Sanitise: ensure each item at least has a non-empty source string
  return (raw.terms as unknown[]).flatMap((t): GlossaryTerm[] => {
    if (!t || typeof t !== "object") return [];
    const item = t as Record<string, unknown>;
    const source = String(item.source ?? "").trim();
    if (!source) return [];

    const out: GlossaryTerm = { source };
    if (item.doNotTranslate) out.doNotTranslate = true;
    if (typeof item.note === "string" && item.note.trim()) out.note = item.note.trim();

    if (item.translations && typeof item.translations === "object" && !Array.isArray(item.translations)) {
      const trans: Record<string, string> = {};
      for (const [k, v] of Object.entries(item.translations as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim()) trans[k.trim()] = v.trim();
      }
      if (Object.keys(trans).length) out.translations = trans;
    }
    return [out];
  });
}
