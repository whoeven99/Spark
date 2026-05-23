import OpenAI from "openai";

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for translation");
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

export type TranslateItem = {
  key: string;
  value: string;
  digest: string;
};

export type TranslateResult = {
  key: string;
  translatedValue: string;
  digest: string;
};

const BATCH_SIZE = 20;

/** Translate a batch of items. If testMode=true, returns original values without calling LLM. */
export async function translateBatch(
  items: TranslateItem[],
  source: string,
  target: string,
  aiModel: string,
  testMode: boolean,
): Promise<TranslateResult[]> {
  if (testMode) {
    return items.map((item) => ({
      key: item.key,
      translatedValue: item.value,
      digest: item.digest,
    }));
  }

  const results: TranslateResult[] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const batchResults = await translateBatchLLM(batch, source, target, aiModel);
    results.push(...batchResults);
  }
  return results;
}

async function translateBatchLLM(
  items: TranslateItem[],
  source: string,
  target: string,
  aiModel: string,
): Promise<TranslateResult[]> {
  const payload = items.map((item) => ({ key: item.key, value: item.value }));
  const prompt = `You are a professional e-commerce translator.
Translate the following content from "${source}" to "${target}".
Return a JSON array (same length, same order) where each element is: {"key": "<original key>", "translatedValue": "<translated text>"}.
Rules:
- Keep HTML tags intact
- Do not translate URLs, handles/slugs, or product IDs
- Be accurate and natural for e-commerce
- If the value is empty or a URL/handle, return the original value unchanged

Input JSON:
${JSON.stringify(payload)}

Return ONLY the JSON array, no markdown, no explanation.`;

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: aiModel || "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "[]";

  let parsed: Array<{ key: string; translatedValue: string }>;
  try {
    const obj = JSON.parse(raw) as unknown;
    parsed = Array.isArray(obj) ? obj : ((obj as { translations?: unknown }).translations as typeof parsed) ?? [];
  } catch {
    console.warn("[llm] failed to parse response, using originals");
    parsed = [];
  }

  // Map back by key, fall back to original value if missing
  const resultMap = new Map(parsed.map((r) => [r.key, r.translatedValue]));
  return items.map((item) => ({
    key: item.key,
    translatedValue: resultMap.get(item.key) ?? item.value,
    digest: item.digest,
  }));
}
