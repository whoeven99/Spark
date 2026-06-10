/**
 * Parse a glossary from free-form document text using an LLM.
 * Returns a list of GlossaryTerm objects for the user to preview & confirm.
 */

import type { GlossaryTerm } from "../routes/glossary.js";

const SYSTEM_PROMPT = `You are a translation glossary extractor.
Given document text (product descriptions, brand guidelines, marketing copy, etc.),
extract all product terms, brand terms, and domain-specific vocabulary that should
be consistently translated.

Return ONLY a valid JSON array — no markdown, no explanation, no code fences.
Each element must have this shape:
{
  "source": "original term",
  "doNotTranslate": false,
  "note": "optional context",
  "translations": { "en": "...", "zh-CN": "...", "de": "..." }
}

Rules:
- Include proper nouns, product names, brand-specific terms, specialized jargon.
- For terms that must stay in the source language (brand names, trademarks),
  set doNotTranslate: true and omit translations.
- Only include translations when they are actually present in or inferable from the text.
- Deduplicate. Return 5–60 terms. Prefer quality over quantity.`;

type LLMConfig = {
  url: string;
  headers: Record<string, string>;
  model: string;
};

function resolveLLM(): LLMConfig | null {
  const deepSeekKeys = process.env.DEEPSEEK_API_KEYS?.split(",").filter(Boolean) ?? [];
  if (deepSeekKeys.length) {
    return {
      url: "https://api.deepseek.com/chat/completions",
      headers: { Authorization: `Bearer ${deepSeekKeys[0]}` },
      model: "deepseek-chat",
    };
  }

  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if (openAiKey) {
    return {
      url: "https://api.openai.com/v1/chat/completions",
      headers: { Authorization: `Bearer ${openAiKey}` },
      model: process.env.OPENAI_GLOSSARY_MODEL ?? "gpt-4o-mini",
    };
  }

  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT?.trim();
  const azureKey = process.env.AZURE_OPENAI_KEY?.trim();
  const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT?.trim();
  if (azureEndpoint && azureKey && azureDeployment) {
    return {
      url: `${azureEndpoint}/openai/deployments/${azureDeployment}/chat/completions?api-version=2024-02-15-preview`,
      headers: { "api-key": azureKey },
      model: azureDeployment,
    };
  }

  return null;
}

export async function parseGlossaryWithLLM(documentText: string): Promise<GlossaryTerm[]> {
  const cfg = resolveLLM();
  if (!cfg) throw new Error("No LLM configured (set DEEPSEEK_API_KEYS, OPENAI_API_KEY, or AZURE_OPENAI_*)");

  const body = JSON.stringify({
    model: cfg.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Extract glossary terms from this text:\n\n${documentText}` },
    ],
    temperature: 0.2,
    max_tokens: 4096,
  });

  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...cfg.headers,
    },
    body,
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`LLM error ${res.status}: ${txt}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim() ?? "";

  // Strip possible markdown fences
  const jsonStr = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`LLM returned invalid JSON: ${jsonStr.slice(0, 200)}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("LLM did not return a JSON array");
  }

  // Validate & coerce each element
  const terms: GlossaryTerm[] = [];
  for (const item of parsed as unknown[]) {
    if (typeof item !== "object" || !item || typeof (item as Record<string, unknown>).source !== "string") continue;
    const t = item as Record<string, unknown>;
    terms.push({
      source: (t.source as string).trim(),
      doNotTranslate: Boolean(t.doNotTranslate),
      note: typeof t.note === "string" && t.note.trim() ? t.note.trim() : undefined,
      translations:
        t.translations && typeof t.translations === "object" && !Array.isArray(t.translations)
          ? (t.translations as Record<string, string>)
          : undefined,
    });
  }

  return terms;
}
