import {
  getTranslateV3BlobContainer,
  translateV3ReadTextFull,
} from "./translateBlobStore.server";
import { getTranslateRedisClient } from "./translateRedis.server";

/** Mirror worker/src/services/glossary.ts */
export type GlossaryTerm = {
  source: string;
  translations?: Record<string, string>;
  doNotTranslate?: boolean;
  note?: string;
};

export type GlossaryFile = {
  terms: GlossaryTerm[];
};

function glossaryBlobPath(shopName: string): string {
  return `glossary/${shopName}.json`;
}

export function isGlossaryBlobConfigured(): boolean {
  return Boolean(process.env.AZURE_BLOB_CONNECTION_STRING?.trim());
}

export async function readGlossary(shopName: string): Promise<GlossaryTerm[]> {
  if (!isGlossaryBlobConfigured()) return [];
  const raw = await translateV3ReadTextFull(glossaryBlobPath(shopName));
  if (!raw) return [];
  try {
    const file = JSON.parse(raw) as GlossaryFile;
    return file?.terms ?? [];
  } catch {
    return [];
  }
}

async function writeGlossary(shopName: string, terms: GlossaryTerm[]): Promise<void> {
  const container = await getTranslateV3BlobContainer();
  const text = JSON.stringify({ terms } satisfies GlossaryFile, null, 2);
  const client = container.getBlockBlobClient(glossaryBlobPath(shopName));
  await client.upload(text, Buffer.byteLength(text, "utf8"), {
    blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
  });
}

async function bumpGlossaryVersion(shopName: string): Promise<void> {
  try {
    await getTranslateRedisClient().set(
      `translate:v4:glossary_v:${shopName}`,
      Date.now().toString(),
      "EX",
      7 * 86400,
    );
  } catch {
    // best-effort — worker picks up within in-process TTL at worst
  }
}

export function validateGlossaryTerms(terms: unknown): GlossaryTerm[] {
  if (!Array.isArray(terms)) throw new Error("terms must be an array");
  return terms.map((t, i) => {
    if (!t || typeof t !== "object") throw new Error(`term[${i}] must be an object`);
    const term = t as Record<string, unknown>;
    if (typeof term.source !== "string" || !term.source.trim()) {
      throw new Error(`term[${i}].source must be a non-empty string`);
    }
    const out: GlossaryTerm = { source: term.source.trim() };
    if (term.doNotTranslate) out.doNotTranslate = true;
    if (typeof term.note === "string" && term.note.trim()) out.note = term.note.trim();
    if (term.translations && typeof term.translations === "object" && !Array.isArray(term.translations)) {
      const trans: Record<string, string> = {};
      for (const [locale, val] of Object.entries(term.translations as Record<string, unknown>)) {
        if (typeof val === "string" && val.trim()) trans[locale.trim()] = val.trim();
      }
      if (Object.keys(trans).length) out.translations = trans;
    }
    return out;
  });
}

export async function saveGlossary(shopName: string, terms: GlossaryTerm[]): Promise<number> {
  if (!isGlossaryBlobConfigured()) {
    throw new Error("Blob 未配置：请设置 AZURE_BLOB_CONNECTION_STRING");
  }
  const validated = validateGlossaryTerms(terms);
  await writeGlossary(shopName, validated);
  await bumpGlossaryVersion(shopName);
  return validated.length;
}
