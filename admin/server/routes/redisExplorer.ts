import { Router } from "express";
import type { SqlParameter } from "@azure/cosmos";
import { getRedis, batchGetWithTtl } from "../lib/redis.js";
import { getTranslationJobsContainer, isCosmosConfigured } from "../lib/cosmos.js";
import {
  COMMON_TM_MODELS,
  DEFAULT_TM_MODEL,
  parseDigestTmKey,
  previewText,
  tmBrowseScanPattern,
  tmDigestKey,
  tmValueKey,
  valueCacheKeyId,
} from "../lib/translationMemory.js";

export const redisExplorerRouter = Router();

/** 每页 SCAN 最多轮数（严格分页，避免单次请求扫太久）。 */
const BROWSE_SCAN_MAX_ROUNDS = 6;
/** 每轮 SCAN COUNT hint。 */
const BROWSE_SCAN_COUNT = 80;

type TmLookupBody = {
  mode?: "text" | "digest";
  shop?: string;
  sourceText?: string;
  digest?: string;
  source?: string;
  model?: string;
  targets?: string[];
  /** digest 模式：对全部常见模型逐个查询。 */
  tryAllModels?: boolean;
};

export type TmLookupRow = {
  target: string;
  model: string;
  hit: boolean;
  key: string;
  value: string | null;
  ttl: number;
  cacheType: "value" | "digest";
};

async function batchGetTmRows(
  redis: NonNullable<ReturnType<typeof getRedis>>,
  specs: { target: string; model: string; key: string; cacheType: "value" | "digest" }[],
): Promise<TmLookupRow[]> {
  if (specs.length === 0) return [];

  const rows = await batchGetWithTtl(
    redis,
    specs.map((spec) => spec.key),
  );

  return specs.map((spec, i) => {
    const value = rows[i]?.value ?? null;
    const ttl = rows[i]?.ttl ?? -2;
    return {
      target: spec.target,
      model: spec.model,
      hit: value != null,
      key: spec.key,
      value,
      ttl,
      cacheType: spec.cacheType,
    };
  });
}

/** 按原文或 digest 精确查询 TM 缓存（多目标语言 × 可选多模型）。 */
redisExplorerRouter.post("/tm/lookup", async (req, res) => {
  const redis = getRedis();
  if (!redis) {
    res.status(503).json({ error: "Redis not configured" });
    return;
  }

  const body = req.body as TmLookupBody;
  const mode = body.mode === "digest" ? "digest" : "text";
  const model = body.model?.trim() || DEFAULT_TM_MODEL;
  const tryAllModels = Boolean(body.tryAllModels);
  const models = tryAllModels ? [...COMMON_TM_MODELS] : [model];
  const targets = (body.targets ?? []).map((t) => t.trim()).filter(Boolean);

  if (targets.length === 0) {
    res.status(400).json({ error: "请至少指定一个目标语言" });
    return;
  }
  if (targets.length > 50) {
    res.status(400).json({ error: "目标语言最多 50 个" });
    return;
  }
  if (tryAllModels && mode !== "digest") {
    res.status(400).json({ error: "「尝试全部常见模型」仅支持 digest 查询" });
    return;
  }
  if (targets.length * models.length > 500) {
    res.status(400).json({ error: "目标语言 × 模型组合过多，请减少目标语言" });
    return;
  }

  try {
    if (mode === "text") {
      const sourceText = body.sourceText?.trim() ?? "";
      const source = body.source?.trim() ?? "";
      const digest = body.digest?.trim() || undefined;
      if (!sourceText) {
        res.status(400).json({ error: "请输入原文" });
        return;
      }
      if (!source) {
        res.status(400).json({ error: "按原文查询需填写源语言" });
        return;
      }

      const keyId = valueCacheKeyId(sourceText, digest);
      const specs = targets.map((target) => ({
        target,
        model,
        key: tmValueKey(sourceText, source, target, model, digest),
        cacheType: "value" as const,
      }));
      const results = await batchGetTmRows(redis, specs);

      res.json({
        mode: "text",
        model,
        tryAllModels: false,
        source,
        sourceText,
        digest: digest ?? null,
        keyId,
        results,
        note: digest
          ? `value 缓存（tm:v5:val:{source}:{target}:{model}:{digest}），keyId 使用 Shopify digest`
          : `value 缓存（tm:v5:val:{source}:{target}:{model}:{crc32}），keyId=${keyId}`,
      });
      return;
    }

    const shop = body.shop?.trim() ?? "";
    const digest = body.digest?.trim() ?? "";
    if (!shop) {
      res.status(400).json({ error: "按 digest 查询需填写店铺" });
      return;
    }
    if (!digest) {
      res.status(400).json({ error: "请输入 digest" });
      return;
    }

    const specs: { target: string; model: string; key: string; cacheType: "digest" }[] = [];
    for (const target of targets) {
      for (const m of models) {
        specs.push({
          target,
          model: m,
          key: tmDigestKey(shop, target, m, digest),
          cacheType: "digest",
        });
      }
    }
    const results = await batchGetTmRows(redis, specs);
    results.sort((a, b) => {
      const lang = a.target.localeCompare(b.target);
      if (lang !== 0) return lang;
      if (a.hit !== b.hit) return a.hit ? -1 : 1;
      return a.model.localeCompare(b.model);
    });

    res.json({
      mode: "digest",
      shop,
      digest,
      model: tryAllModels ? undefined : model,
      tryAllModels,
      models: tryAllModels ? [...COMMON_TM_MODELS] : undefined,
      results,
      note: tryAllModels
        ? `已对 ${COMMON_TM_MODELS.length} 个常见模型逐个查询 digest 主缓存`
        : "digest 主缓存（tm:v5:{shop}:{target}:{model}:{digest}）",
    });
  } catch (err) {
    console.error("[redis-explorer/tm/lookup]", err);
    res.status(500).json({ error: String(err) });
  }
});

/** 从 Cosmos 翻译任务推断该店出现过的目标语言。 */
redisExplorerRouter.get("/tm/shop-targets", async (req, res) => {
  const shop = (req.query.shop as string | undefined)?.trim() ?? "";
  if (!shop) {
    res.status(400).json({ error: "shop is required" });
    return;
  }

  if (!isCosmosConfigured()) {
    res.json({ shop, targets: [], note: "Cosmos not configured" });
    return;
  }

  try {
    const container = getTranslationJobsContainer();
    const query =
      "SELECT DISTINCT VALUE c.target FROM c WHERE c.shopName = @shop ORDER BY c.target";
    const params: SqlParameter[] = [{ name: "@shop", value: shop }];

    const { resources } = await container.items
      .query<string>({ query, parameters: params })
      .fetchAll();

    const targets = resources.filter(
      (t: string) => typeof t === "string" && t.trim(),
    );
    res.json({
      shop,
      targets,
      note: targets.length
        ? `从翻译任务历史推断 ${targets.length} 个目标语言`
        : "该店铺暂无翻译任务记录",
    });
  } catch (err) {
    if (String(err).includes("Owner resource does not exist")) {
      res.json({ shop, targets: [], note: "翻译任务容器不存在或无访问权限" });
      return;
    }
    console.error("[redis-explorer/tm/shop-targets]", err);
    res.status(500).json({ error: String(err) });
  }
});

export type TmBrowseEntry = {
  key: string;
  target: string;
  model: string;
  digest: string;
  value: string;
  valuePreview: string;
  ttl: number;
};

/** 按店铺 SCAN digest 型 TM 缓存（严格 cursor 分页）。 */
redisExplorerRouter.get("/tm/browse", async (req, res) => {
  const redis = getRedis();
  if (!redis) {
    res.json({
      shop: "",
      entries: [],
      byTarget: {},
      cursor: "0",
      hasMore: false,
      note: "Redis not configured",
    });
    return;
  }

  const shop = (req.query.shop as string | undefined)?.trim() ?? "";
  if (!shop) {
    res.status(400).json({ error: "shop is required" });
    return;
  }

  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const startCursor = (req.query.cursor as string | undefined)?.trim() || "0";
  const targetFilter = (req.query.target as string | undefined)?.trim();

  try {
    const pattern = tmBrowseScanPattern(shop, targetFilter);
    const collectedKeys: string[] = [];
    let cursor = startCursor;
    let rounds = 0;

    while (
      collectedKeys.length < limit &&
      rounds < BROWSE_SCAN_MAX_ROUNDS &&
      (rounds === 0 || cursor !== "0")
    ) {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        BROWSE_SCAN_COUNT,
      );
      for (const key of keys) {
        if (parseDigestTmKey(key)) collectedKeys.push(key);
      }
      cursor = nextCursor;
      rounds++;
      if (cursor === "0") break;
    }

    const uniqueKeys = [...new Set(collectedKeys)].slice(0, limit);
    const hasMore = cursor !== "0";

    if (uniqueKeys.length === 0) {
      res.json({
        shop,
        entries: [],
        byTarget: {},
        cursor,
        hasMore,
        pattern,
        note: hasMore
          ? "本页未匹配到有效键，可继续加载下一页"
          : "未找到该店铺的 digest 型 TM 缓存（value 缓存 tm:v5:val 无店铺维度，请用「按原文」查询）",
      });
      return;
    }

    const rows = await batchGetWithTtl(redis, uniqueKeys);

    const entries: TmBrowseEntry[] = [];
    const byTarget: Record<string, number> = {};

    uniqueKeys.forEach((key, i) => {
      const parsed = parseDigestTmKey(key);
      if (!parsed) return;

      const value = rows[i]?.value ?? "";
      const ttl = rows[i]?.ttl ?? -2;
      if (!value) return;

      byTarget[parsed.target] = (byTarget[parsed.target] ?? 0) + 1;
      entries.push({
        key,
        target: parsed.target,
        model: parsed.model,
        digest: parsed.digest,
        value,
        valuePreview: previewText(value),
        ttl,
      });
    });

    entries.sort((a, b) => a.target.localeCompare(b.target));

    res.json({
      shop,
      entries,
      byTarget,
      cursor,
      hasMore,
      pattern,
      scanned: uniqueKeys.length,
    });
  } catch (err) {
    console.error("[redis-explorer/tm/browse]", err);
    res.status(500).json({ error: String(err) });
  }
});

/** 返回常见 TM 模型列表（供前端下拉）。 */
redisExplorerRouter.get("/tm/models", (_req, res) => {
  res.json({ models: [...COMMON_TM_MODELS], defaultModel: DEFAULT_TM_MODEL });
});
