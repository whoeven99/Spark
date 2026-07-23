import { blobRead } from "./blob.js";

export type TsfProfileStrategy = {
  brandTerms: string[];
  doNotTranslateTerms: string[];
  preferredTerms: Array<{ source: string; note: string | null }>;
  seoTerms: string[];
  moduleHints: Array<{
    module: string;
    tonePolicy: string | null;
    keywordPolicy: string | null;
    literalVsAdaptive: string | null;
  }>;
};

export type TsfGlossarySuggestion = {
  locale: string;
  source: string;
  target: string;
};

export type TsfShopUnderstanding = {
  industry: string | null;
  subIndustry: string | null;
  brandPositioning: string | null;
  coreProductTypes: string[];
  sellingPoints: string[];
  priceRange: string | null;
  voiceStyle: string | null;
  seoDirection: string | null;
  marketNotes: string[];
  description: string | null;
  keywords: string[];
};

export type TsfShopMarket = {
  name: string;
  handle: string;
  status: string;
  baseCurrency: string | null;
  locales: string[];
};

export type TsfShopSignals = {
  weightedTopTerms: Array<{
    term: string;
    score: number;
    count: number;
    sources: string[];
  }>;
  weightedTopPhrases: Array<{
    term: string;
    score: number;
    count: number;
    sources: string[];
  }>;
  brandTerms: string[];
  categoryTerms: string[];
  menuTerms: string[];
  representativeSamples: Array<{ source: string; text: string }>;
  sourceStats: Record<string, number>;
};

export type TsfShopProfileFacts = {
  shopName: string;
  primaryDomain: string | null;
  currencyCode: string | null;
  productTypes: string[];
  vendors: string[];
  topProductTitles: string[];
  collectionTitles: string[];
  collectionDescriptions: string[];
  articleTitles: string[];
  articleSummaries: string[];
  menuTitles: string[];
  tags: string[];
};

export type TsfThemeTextSample = {
  text: string;
  module: string;
  key: string;
  weight: number;
};

export type TsfShopScanArtifacts = {
  strategy: TsfProfileStrategy | null;
  glossarySuggestions: TsfGlossarySuggestion[];
  understanding: TsfShopUnderstanding | null;
  markets: TsfShopMarket[];
  signals: TsfShopSignals | null;
  facts: TsfShopProfileFacts | null;
  themeTexts: TsfThemeTextSample[];
  source: "cosmos" | "blob" | "mixed" | "none";
};

type ScanSummary = {
  profileStrategy?: TsfProfileStrategy | null;
  glossarySuggestions?: TsfGlossarySuggestion[];
};

type ProfileFactsBlob = {
  facts?: unknown;
  markets?: unknown;
  themeTexts?: unknown;
  signals?: unknown;
  induction?: {
    understanding?: unknown;
    strategy?: TsfProfileStrategy | null;
  } | null;
};

type GlossaryRawBlob = {
  perLocale?: Array<{
    locale?: string;
    terms?: Array<{ source?: string; target?: string }>;
  }>;
};

type LatestScanBlob = {
  profile?: ProfileFactsBlob | null;
  glossary?: GlossaryRawBlob | null;
};

/** 从 blobPrefix 推断 shop：`shop-profile/{shop}` 或历史 `shop-scan/{shop}/{scanId}`。 */
function shopFromBlobPrefix(blobPrefix: string): string | null {
  const parts = blobPrefix.replace(/\/+$/, "").split("/").filter(Boolean);
  if (parts[0] === "shop-profile" && parts[1]) return parts[1];
  if (parts[0] === "shop-scan" && parts[1]) return parts[1];
  return null;
}

/**
 * 优先读稳定文件 `shop-profile/{shop}/latest-scan.json`，再 fallback 旧散文件。
 * strategy / glossary 优先 Cosmos summary。
 */
export async function loadTsfShopProfileArtifacts(
  blobPrefix: string | null | undefined,
  summary?: ScanSummary | null,
): Promise<TsfShopScanArtifacts> {
  const strategyFromCosmos = normalizeStrategy(summary?.profileStrategy);
  const glossaryFromCosmos = normalizeGlossaryRows(summary?.glossarySuggestions);

  let understanding: TsfShopUnderstanding | null = null;
  let markets: TsfShopMarket[] = [];
  let signals: TsfShopSignals | null = null;
  let facts: TsfShopProfileFacts | null = null;
  let themeTexts: TsfThemeTextSample[] = [];
  let strategyFromBlob: TsfProfileStrategy | null = null;
  let glossaryFromBlob: TsfGlossarySuggestion[] = [];
  let readBlob = false;

  let profileFacts: ProfileFactsBlob | null = null;
  let glossaryRaw: GlossaryRawBlob | null = null;

  const shop = blobPrefix ? shopFromBlobPrefix(blobPrefix) : null;
  if (shop) {
    const latest = await blobRead<LatestScanBlob>(`shop-profile/${shop}/latest-scan.json`);
    if (latest?.profile || latest?.glossary) {
      profileFacts = latest.profile ?? null;
      glossaryRaw = glossaryFromCosmos.length ? null : (latest.glossary ?? null);
      readBlob = true;
    }
  }

  if (!profileFacts && !glossaryRaw && blobPrefix) {
    const prefix = blobPrefix.endsWith("/") ? blobPrefix : `${blobPrefix}/`;
    const [legacyProfile, legacyGlossary] = await Promise.all([
      blobRead<ProfileFactsBlob>(`${prefix}profile-facts.json`),
      glossaryFromCosmos.length
        ? Promise.resolve(null)
        : blobRead<GlossaryRawBlob>(`${prefix}glossary-raw.json`),
    ]);
    profileFacts = legacyProfile;
    glossaryRaw = legacyGlossary;
    readBlob = Boolean(profileFacts || glossaryRaw);
  }

  if (profileFacts || glossaryRaw) {
    understanding = normalizeUnderstanding(profileFacts?.induction?.understanding);
    markets = normalizeMarkets(profileFacts?.markets);
    signals = normalizeSignals(profileFacts?.signals);
    facts = normalizeFacts(profileFacts?.facts);
    themeTexts = normalizeThemeTexts(profileFacts?.themeTexts);
    strategyFromBlob = normalizeStrategy(profileFacts?.induction?.strategy);
    glossaryFromBlob = normalizeGlossaryBlob(glossaryRaw);
  }

  const strategy = strategyFromCosmos ?? strategyFromBlob;
  const glossarySuggestions = glossaryFromCosmos.length
    ? glossaryFromCosmos
    : glossaryFromBlob;
  const hasCosmos = Boolean(strategyFromCosmos || glossaryFromCosmos.length);
  const hasBlob = Boolean(
    understanding || markets.length || signals || facts || themeTexts.length || strategyFromBlob || glossaryFromBlob.length,
  );

  return {
    strategy,
    glossarySuggestions,
    understanding,
    markets,
    signals,
    facts,
    themeTexts,
    source: hasCosmos && (hasBlob || readBlob)
      ? "mixed"
      : hasCosmos
        ? "cosmos"
        : hasBlob
          ? "blob"
          : "none",
  };
}

function normalizeFacts(raw: unknown): TsfShopProfileFacts | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const shopName = str(row.shopName);
  if (!shopName) return null;
  return {
    shopName,
    primaryDomain: str(row.primaryDomain),
    currencyCode: str(row.currencyCode),
    productTypes: stringList(row.productTypes, 100),
    vendors: stringList(row.vendors, 100),
    topProductTitles: stringList(row.topProductTitles, 100),
    collectionTitles: stringList(row.collectionTitles, 100),
    collectionDescriptions: stringList(row.collectionDescriptions, 100),
    articleTitles: stringList(row.articleTitles, 100),
    articleSummaries: stringList(row.articleSummaries, 100),
    menuTitles: stringList(row.menuTitles, 100),
    tags: stringList(row.tags, 200),
  };
}

function normalizeThemeTexts(raw: unknown): TsfThemeTextSample[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const text = str(row.text);
      const module = str(row.module);
      const key = str(row.key);
      if (!text || !module || !key) return null;
      return { text, module, key, weight: Number(row.weight) || 0 };
    })
    .filter((item): item is TsfThemeTextSample => Boolean(item));
}

export function buildTsfShopProfilePromptBlock(profile: {
  industry?: string | null;
  keywords?: string[] | null;
  description?: string | null;
  brandTone?: string | null;
} | null): string | null {
  if (!profile) return null;
  const industry = profile.industry?.trim();
  const brandTone = profile.brandTone?.trim();
  const description = truncate(profile.description?.trim() ?? "", 400);
  const keywords = (profile.keywords ?? [])
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .slice(0, 15);
  const lines: string[] = [];
  if (industry) lines.push(`- Industry / category: ${industry}`);
  if (brandTone) lines.push(`- Brand voice / tone: ${brandTone}`);
  if (keywords.length) lines.push(`- Key terms: ${keywords.join(", ")}`);
  if (description) lines.push(`- About the shop: ${description}`);
  if (!lines.length) return null;
  return [
    "Shop profile (background context to guide tone, terminology, and localization; do NOT translate or output this block):",
    ...lines,
  ].join("\n");
}

function normalizeStrategy(raw: TsfProfileStrategy | null | undefined): TsfProfileStrategy | null {
  if (!raw) return null;
  const strategy: TsfProfileStrategy = {
    brandTerms: stringList(raw.brandTerms, 20),
    doNotTranslateTerms: stringList(raw.doNotTranslateTerms, 20),
    seoTerms: stringList(raw.seoTerms, 15),
    preferredTerms: (raw.preferredTerms ?? [])
      .map((item) => ({
        source: String(item?.source ?? "").trim(),
        note: item?.note?.trim() || null,
      }))
      .filter((item) => item.source)
      .slice(0, 20),
    moduleHints: (raw.moduleHints ?? [])
      .map((item) => ({
        module: String(item?.module ?? "").trim(),
        tonePolicy: item?.tonePolicy?.trim() || null,
        keywordPolicy: item?.keywordPolicy?.trim() || null,
        literalVsAdaptive: item?.literalVsAdaptive?.trim() || null,
      }))
      .filter((item) => item.module)
      .slice(0, 10),
  };
  return Object.values(strategy).some((value) => Array.isArray(value) && value.length)
    ? strategy
    : null;
}

function normalizeUnderstanding(raw: unknown): TsfShopUnderstanding | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const value: TsfShopUnderstanding = {
    industry: str(row.industry),
    subIndustry: str(row.subIndustry),
    brandPositioning: str(row.brandPositioning),
    coreProductTypes: stringList(row.coreProductTypes, 12),
    sellingPoints: stringList(row.sellingPoints, 8),
    priceRange: str(row.priceRange),
    voiceStyle: str(row.voiceStyle),
    seoDirection: str(row.seoDirection),
    marketNotes: stringList(row.marketNotes, 8),
    description: str(row.description),
    keywords: stringList(row.keywords, 20),
  };
  return Object.values(value).some((item) => Array.isArray(item) ? item.length : Boolean(item))
    ? value
    : null;
}

function normalizeMarkets(raw: unknown): TsfShopMarket[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const name = str(row.name);
      if (!name) return null;
      return {
        name,
        handle: str(row.handle) ?? "",
        status: str(row.status) ?? "",
        baseCurrency: str(row.baseCurrency),
        locales: stringList(row.locales, 20),
      };
    })
    .filter((item): item is TsfShopMarket => Boolean(item))
    .slice(0, 50);
}

function normalizeSignals(raw: unknown): TsfShopSignals | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const sourceStats: Record<string, number> = {};
  if (row.sourceStats && typeof row.sourceStats === "object" && !Array.isArray(row.sourceStats)) {
    for (const [key, rawValue] of Object.entries(row.sourceStats as Record<string, unknown>)) {
      const value = Number(rawValue);
      if (key && Number.isFinite(value) && value > 0) sourceStats[key] = value;
    }
  }
  const value: TsfShopSignals = {
    weightedTopTerms: normalizeWeightedTerms(row.weightedTopTerms, 30),
    weightedTopPhrases: normalizeWeightedTerms(row.weightedTopPhrases, 20),
    brandTerms: stringList(row.brandTerms, 20),
    categoryTerms: stringList(row.categoryTerms, 20),
    menuTerms: stringList(row.menuTerms, 20),
    representativeSamples: Array.isArray(row.representativeSamples)
      ? row.representativeSamples
          .map((sample) => {
            if (!sample || typeof sample !== "object") return null;
            const sampleRow = sample as Record<string, unknown>;
            const source = str(sampleRow.source);
            const text = str(sampleRow.text);
            return source && text ? { source, text } : null;
          })
          .filter((item): item is { source: string; text: string } => Boolean(item))
          .slice(0, 40)
      : [],
    sourceStats,
  };
  return Object.values(value).some((item) =>
    Array.isArray(item) ? item.length : Object.keys(item).length,
  ) ? value : null;
}

function normalizeWeightedTerms(raw: unknown, max: number) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const term = str(row.term);
      if (!term) return null;
      return {
        term,
        score: Number(row.score) || 0,
        count: Number(row.count) || 0,
        sources: stringList(row.sources, 10),
      };
    })
    .filter((item): item is { term: string; score: number; count: number; sources: string[] } => Boolean(item))
    .slice(0, max);
}

function normalizeGlossaryRows(rows: TsfGlossarySuggestion[] | undefined) {
  const out: TsfGlossarySuggestion[] = [];
  const seen = new Set<string>();
  for (const row of rows ?? []) {
    const locale = String(row.locale ?? "").trim();
    const source = String(row.source ?? "").trim();
    const target = String(row.target ?? "").trim();
    const key = `${locale}\u0000${source}\u0000${target}`;
    if (!locale || !source || !target || seen.has(key)) continue;
    seen.add(key);
    out.push({ locale, source, target });
  }
  return out;
}

function normalizeGlossaryBlob(raw: GlossaryRawBlob | null) {
  const rows: TsfGlossarySuggestion[] = [];
  for (const localeRow of raw?.perLocale ?? []) {
    for (const term of localeRow.terms ?? []) {
      rows.push({
        locale: String(localeRow.locale ?? ""),
        source: String(term.source ?? ""),
        target: String(term.target ?? ""),
      });
    }
  }
  return normalizeGlossaryRows(rows);
}

function stringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, max);
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}
