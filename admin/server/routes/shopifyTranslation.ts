import { Router, type Request, type Response } from "express";
import multer from "multer";
import { resolveShopAccessToken } from "../lib/shopSession.js";
import {
  RESOURCE_TYPES,
  ShopifyTranslationOps,
  METAFIELD_RESOURCE_MODULES,
  summarizeMetafieldNamespaces,
  metafieldSummaryToCsv,
  type ResourceType,
  type TranslationRow,
  type MetafieldModuleKey,
} from "../lib/shopifyTranslationOps.js";
import {
  QUERY_CSV_REQUIRED_COLUMNS,
  STANDARD_CSV_REQUIRED_COLUMNS,
  DELETE_CSV_REQUIRED_COLUMNS,
  assertCsvColumns,
  decodeCsvBuffer,
  formatBatchSseLine,
  groupBatchesByResourceId,
  isQueryCsvRowValid,
  parseCsvText,
  parseQueryCsvConcurrency,
  type BatchImportEvent,
} from "../lib/queryCsvImport.js";
import { getTsfDb, isTsfDbConfigured } from "../lib/tsfDb.js";
import { normalizeShopName } from "../lib/shopSession.js";
import {
  buildLiquidRuleImportPlan,
  formatLiquidRuleImportSummary,
  insertLiquidRules,
  loadExistingLiquidRuleKeys,
  parseLiquidRuleCsvBuffer,
} from "../lib/userLiquidCsvImport.js";

export const shopifyTranslationRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

function sendResolveError(res: Response, e: unknown, status = 400) {
  const msg = e instanceof Error ? e.message : String(e);
  res.status(status).json({ error: msg });
}

async function withShopOps<T>(
  shopName: string,
  fn: (ops: ShopifyTranslationOps, shop: string) => Promise<T>,
): Promise<T> {
  const session = await resolveShopAccessToken(shopName);
  const ops = new ShopifyTranslationOps(session.shop, session.accessToken);
  return fn(ops, session.shop);
}

shopifyTranslationRouter.get("/resource-types", (_req, res) => {
  res.json({ resourceTypes: RESOURCE_TYPES });
});

shopifyTranslationRouter.get("/session-check", async (req, res) => {
  const shopName = String(req.query.shopName ?? "").trim();
  if (!shopName) {
    res.status(400).json({ error: "shopName 不能为空" });
    return;
  }
  try {
    const session = await resolveShopAccessToken(shopName);
    res.json({
      shop: session.shop,
      hasToken: true,
      scope: session.scope,
    });
  } catch (e) {
    sendResolveError(res, e);
  }
});

shopifyTranslationRouter.get("/metafield-modules", (_req, res) => {
  res.json({
    modules: Object.entries(METAFIELD_RESOURCE_MODULES).map(([key, conf]) => ({
      key,
      label: conf.label,
      rootField: conf.rootField,
    })),
  });
});

shopifyTranslationRouter.post("/alt-query", async (req, res) => {
  const shopName = String(req.body?.shopName ?? "").trim();
  const queryString = req.body?.query != null ? String(req.body.query).trim() || null : null;
  const sortKey = req.body?.sortKey != null ? String(req.body.sortKey).trim() || null : null;
  const reverse = req.body?.reverse === true;

  if (!shopName) {
    res.status(400).json({ error: "shopName 不能为空" });
    return;
  }

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    const session = await resolveShopAccessToken(shopName);
    const ops = new ShopifyTranslationOps(session.shop, session.accessToken);

    for await (const chunk of ops.streamAllProductsWithImages({
      queryString,
      sortKey,
      reverse,
    })) {
      res.write(`${JSON.stringify(chunk)}\n`);
      if (chunk.type === "error") break;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.write(`${JSON.stringify({ type: "error", error: msg })}\n`);
  }

  res.end();
});

shopifyTranslationRouter.post("/metafield-namespace-stats", async (req, res) => {
  const shopName = String(req.body?.shopName ?? "").trim();
  const locale = String(req.body?.locale ?? "zh-HK").trim();
  const selectedModules = Array.isArray(req.body?.modules)
    ? (req.body.modules as string[])
    : [];
  const resourceFirst = Number(req.body?.resourceFirst ?? 100);
  const metafieldFirst = Number(req.body?.metafieldFirst ?? 100);

  if (!shopName) {
    res.status(400).json({ error: "shopName 不能为空" });
    return;
  }
  if (!selectedModules.length) {
    res.status(400).json({ error: "请至少选择一个模块" });
    return;
  }

  const moduleKeys = selectedModules.map((m) => m.trim().toUpperCase());
  const invalid = moduleKeys.filter((m) => !(m in METAFIELD_RESOURCE_MODULES));
  if (invalid.length) {
    res.status(400).json({ error: `不支持的模块: ${invalid.join(", ")}` });
    return;
  }

  try {
    const data = await withShopOps(shopName, async (ops) => {
      const allRows = [];
      for (const module of moduleKeys) {
        const conf = METAFIELD_RESOURCE_MODULES[module as MetafieldModuleKey];
        const rows = await ops.fetchMetafieldsForResource(
          conf.rootField,
          locale,
          resourceFirst,
          metafieldFirst,
        );
        for (const row of rows) {
          row.resource_module = module;
        }
        allRows.push(...rows);
      }
      return allRows;
    });

    const summary = summarizeMetafieldNamespaces(data);
    const csvText = metafieldSummaryToCsv(summary);
    const csvBase64 = Buffer.from(csvText, "utf-8").toString("base64");
    const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);

    res.json({
      summary,
      details: data,
      csvBase64,
      csvFilename: `metafield_namespace_stats_${ts}.csv`,
      totalMetafields: data.length,
    });
  } catch (e) {
    sendResolveError(res, e, 502);
  }
});

shopifyTranslationRouter.post("/query", async (req, res) => {
  const shopName = String(req.body?.shopName ?? "").trim();
  const targetLocale = String(req.body?.targetLocale ?? "").trim();
  const selectedModules = Array.isArray(req.body?.selectedModules)
    ? (req.body.selectedModules as string[])
    : [];

  if (!shopName || !targetLocale) {
    res.status(400).json({ error: "shopName 与 targetLocale 不能为空" });
    return;
  }
  if (!selectedModules.length) {
    res.status(400).json({ error: "请至少选择一个模块" });
    return;
  }

  const invalid = selectedModules.filter(
    (m) => !RESOURCE_TYPES.includes(m as ResourceType),
  );
  if (invalid.length) {
    res.status(400).json({ error: `不支持的模块: ${invalid.join(", ")}` });
    return;
  }

  try {
    const data = await withShopOps(shopName, async (ops) => {
      const allData: TranslationRow[] = [];
      for (const module of selectedModules) {
        const moduleData = await ops.getModuleData(module as ResourceType, targetLocale);
        if (!Array.isArray(moduleData)) {
          throw new Error(moduleData.error);
        }
        allData.push(...moduleData);
      }
      return allData;
    });
    res.json({ data, count: data.length });
  } catch (e) {
    sendResolveError(res, e, 502);
  }
});

shopifyTranslationRouter.post("/register", async (req, res) => {
  const shopName = String(req.body?.shopName ?? "").trim();
  const resourceId = String(req.body?.resourceId ?? "").trim();
  const locale = String(req.body?.locale ?? "").trim();
  const key = String(req.body?.key ?? "").trim();
  const value = String(req.body?.value ?? "");
  const digest = String(req.body?.digest ?? "").trim();

  if (!shopName || !resourceId || !locale || !key || !value || !digest) {
    res.status(400).json({ error: "缺少必要参数" });
    return;
  }

  try {
    const result = await withShopOps(shopName, (ops) =>
      ops.registerTranslation(resourceId, locale, key, value, digest),
    );
    if ("error" in result && result.error) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  } catch (e) {
    sendResolveError(res, e, 502);
  }
});

shopifyTranslationRouter.post("/delete", async (req, res) => {
  const shopName = String(req.body?.shopName ?? "").trim();
  const resourceId = String(req.body?.resourceId ?? "").trim();
  const locale = String(req.body?.locale ?? "").trim();
  const translationKey = String(req.body?.translationKey ?? "").trim();

  if (!shopName || !resourceId || !locale || !translationKey) {
    res.status(400).json({ error: "缺少必要参数" });
    return;
  }

  try {
    const result = await withShopOps(shopName, (ops) =>
      ops.deleteTranslation(resourceId, locale, translationKey),
    );
    if (result.error) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  } catch (e) {
    sendResolveError(res, e, 502);
  }
});

async function importResourceBatches(
  ops: ShopifyTranslationOps,
  resourceId: string,
  locale: string,
  batchList: { items: { key: string; value: string; translatableContentDigest: string }[]; sourceRowCount: number }[],
): Promise<{ events: BatchImportEvent[]; successDelta: number; failedDelta: number }> {
  const events: BatchImportEvent[] = [];
  let successDelta = 0;
  let failedDelta = 0;

  for (const { items, sourceRowCount } of batchList) {
    const writeCount = items.length;
    const dedupNote = writeCount < sourceRowCount ? `（去重后 ${writeCount} 条）` : "";
    try {
      const result = await ops.registerTranslationsBatch(resourceId, locale, items);
      if (result.error) {
        failedDelta += sourceRowCount;
        events.push({
          ok: false,
          resourceId,
          sourceRowCount,
          writeCount,
          dedupNote,
          error: String(result.error),
        });
      } else {
        successDelta += sourceRowCount;
        events.push({
          ok: true,
          resourceId,
          sourceRowCount,
          writeCount,
          dedupNote,
        });
      }
    } catch (e) {
      failedDelta += sourceRowCount;
      events.push({
        ok: false,
        resourceId,
        sourceRowCount,
        writeCount,
        dedupNote,
        error: e instanceof Error ? e.message : String(e),
        isException: true,
      });
    }
  }

  return { events, successDelta, failedDelta };
}

function writeSse(res: Response, line: string) {
  res.write(line);
}

shopifyTranslationRouter.post(
  "/query-csv-import",
  upload.single("file"),
  async (req: Request, res: Response) => {
    const shopName = String(req.body?.shopName ?? "").trim();
    const locale = String(req.body?.locale ?? "").trim();
    const concurrency = parseQueryCsvConcurrency(req.body?.concurrency);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    if (!shopName || !locale) {
      writeSse(res, "data: 缺少 shopName / locale\n\n");
      writeSse(res, "data: __COMPLETE__\n\n");
      res.end();
      return;
    }

    const file = req.file;
    if (!file?.buffer?.length) {
      writeSse(res, "data: 没有上传 CSV 文件\n\n");
      writeSse(res, "data: __COMPLETE__\n\n");
      res.end();
      return;
    }

    try {
      const session = await resolveShopAccessToken(shopName);
      const ops = new ShopifyTranslationOps(session.shop, session.accessToken);

      writeSse(res, `data: 开始处理 CSV（目标语言=${locale}）...\n\n`);

      const decoded = decodeCsvBuffer(file.buffer);
      const rows = parseCsvText(decoded);

      if (!rows.length) {
        writeSse(res, "data: ❌ CSV 为空或无法读取表头\n\n");
        writeSse(res, "data: __COMPLETE__\n\n");
        res.end();
        return;
      }

      const headers = Object.keys(rows[0] ?? {});
      const missing = QUERY_CSV_REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
      if (missing.length) {
        writeSse(res, `data: ❌ CSV 缺少必需列: ${missing.join(", ")}\n\n`);
        writeSse(res, "data: __COMPLETE__\n\n");
        res.end();
        return;
      }

      const total = rows.length;
      const skipped = rows.filter((r) => !isQueryCsvRowValid(r)).length;
      const validCount = total - skipped;

      writeSse(res, `data: 共 ${total} 行，有效 ${validCount} 行，跳过 ${skipped} 行\n\n`);
      writeSse(
        res,
        `data: 按 resource_id 分组写入，并发数=${concurrency}...\n\n`,
      );

      const resourceGroups = groupBatchesByResourceId(rows);
      let processed = 0;
      let success = 0;
      let failed = 0;

      const entries = [...resourceGroups.entries()];

      const processResource = async (resourceId: string, batchList: Parameters<typeof importResourceBatches>[3]) => {
        const { events, successDelta, failedDelta } = await importResourceBatches(
          ops,
          resourceId,
          locale,
          batchList,
        );
        return { events, successDelta, failedDelta };
      };

      if (concurrency <= 1) {
        for (const [resourceId, batchList] of entries) {
          const { events, successDelta, failedDelta } = await processResource(
            resourceId,
            batchList,
          );
          success += successDelta;
          failed += failedDelta;
          for (const event of events) {
            processed += event.sourceRowCount;
            writeSse(res, formatBatchSseLine(event, processed, validCount));
          }
        }
      } else {
        let idx = 0;
        const workers = Array.from({ length: Math.min(concurrency, entries.length) }, async () => {
          while (idx < entries.length) {
            const current = idx++;
            const entry = entries[current];
            if (!entry) break;
            const [resourceId, batchList] = entry;
            const { events, successDelta, failedDelta } = await processResource(
              resourceId,
              batchList,
            );
            success += successDelta;
            failed += failedDelta;
            for (const event of events) {
              processed += event.sourceRowCount;
              writeSse(res, formatBatchSseLine(event, processed, validCount));
            }
          }
        });
        await Promise.all(workers);
      }

      writeSse(res, `data: 完成。成功 ${success} 失败 ${failed} 跳过 ${skipped}\n\n`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      writeSse(res, `data: ❌ 处理过程出错：${msg}\n\n`);
    }

    writeSse(res, "data: __COMPLETE__\n\n");
    res.end();
  },
);

shopifyTranslationRouter.post(
  "/standard-csv-import",
  upload.single("file"),
  async (req: Request, res: Response) => {
    const shopName = String(req.body?.shopName ?? "").trim();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    if (!shopName) {
      writeSse(res, "data: 缺少 shopName\n\n");
      writeSse(res, "data: __COMPLETE__\n\n");
      res.end();
      return;
    }

    const file = req.file;
    if (!file?.buffer?.length) {
      writeSse(res, "data: 没有上传 CSV 文件\n\n");
      writeSse(res, "data: __COMPLETE__\n\n");
      res.end();
      return;
    }

    try {
      const session = await resolveShopAccessToken(shopName);
      const ops = new ShopifyTranslationOps(session.shop, session.accessToken);

      const decoded = decodeCsvBuffer(file.buffer);
      const rows = parseCsvText(decoded);

      if (!rows.length) {
        writeSse(res, "data: ❌ CSV 为空或无法读取表头\n\n");
        writeSse(res, "data: __COMPLETE__\n\n");
        res.end();
        return;
      }

      const headers = Object.keys(rows[0] ?? {});
      const missing = assertCsvColumns(headers, STANDARD_CSV_REQUIRED_COLUMNS);
      if (missing.length) {
        writeSse(res, `data: ❌ CSV 缺少必需列: ${missing.join(", ")}\n\n`);
        writeSse(res, "data: __COMPLETE__\n\n");
        res.end();
        return;
      }

      const total = rows.length;
      let success = 0;
      let failed = 0;
      let skipped = 0;

      writeSse(res, `data: 共 ${total} 条数据，开始逐行写回...\n\n`);

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const rowNum = i + 2;
        const resourceId = (row.resourceId ?? "").trim();
        const locale = (row.target_code ?? "").trim();
        const key = (row.key ?? "").trim();
        const value = row.target_text ?? "";
        const digest = (row.digest ?? "").trim();

        if (!resourceId || !locale || !key || !value || !digest) {
          skipped++;
          writeSse(res, `data: ⚠️ 行${rowNum} 跳过: 行数据不完整\n\n`);
          continue;
        }

        try {
          const result = await ops.registerTranslation(
            resourceId,
            locale,
            key,
            value,
            digest,
          );
          if (result.error) {
            failed++;
            writeSse(res, `data: ❌ 行${rowNum} 失败: ${result.error}\n\n`);
          } else {
            success++;
            writeSse(res, `data: ✅ 行${rowNum} 成功: ${resourceId}, ${key}, ${locale}\n\n`);
          }
        } catch (e) {
          failed++;
          const msg = e instanceof Error ? e.message : String(e);
          writeSse(res, `data: ❌ 行${rowNum} 异常: ${msg}\n\n`);
        }
      }

      writeSse(
        res,
        `data: 完成。成功 ${success} 失败 ${failed} 跳过 ${skipped}\n\n`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      writeSse(res, `data: ❌ 处理过程出错：${msg}\n\n`);
    }

    writeSse(res, "data: __COMPLETE__\n\n");
    res.end();
  },
);

shopifyTranslationRouter.post(
  "/batch-delete-csv",
  upload.single("file"),
  async (req: Request, res: Response) => {
    const shopName = String(req.body?.shopName ?? "").trim();

    if (!shopName) {
      res.status(400).json({ error: "shopName 不能为空", success: false });
      return;
    }

    const file = req.file;
    if (!file?.buffer?.length) {
      res.status(400).json({ error: "没有上传 CSV 文件", success: false });
      return;
    }

    try {
      const session = await resolveShopAccessToken(shopName);
      const ops = new ShopifyTranslationOps(session.shop, session.accessToken);

      const decoded = decodeCsvBuffer(file.buffer);
      const rows = parseCsvText(decoded);

      if (!rows.length) {
        res.status(400).json({ error: "CSV 为空或无法读取表头", success: false });
        return;
      }

      const headers = Object.keys(rows[0] ?? {});
      const missing = assertCsvColumns(headers, DELETE_CSV_REQUIRED_COLUMNS);
      if (missing.length) {
        res.status(400).json({
          error: `CSV 缺少必需列: ${missing.join(", ")}`,
          success: false,
        });
        return;
      }

      const results: {
        row: number;
        resourceId: string;
        locale: string;
        key: string;
        status: "deleted" | "failed" | "skipped";
        message: string;
      }[] = [];

      let successCount = 0;
      let failedCount = 0;
      let skippedCount = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const rowNum = i + 2;
        const resourceId = (row.resourceId ?? "").trim();
        const locale = (row.target_code ?? "").trim();
        const key = (row.key ?? "").trim();

        if (!resourceId || !locale || !key) {
          skippedCount++;
          results.push({
            row: rowNum,
            resourceId,
            locale,
            key,
            status: "skipped",
            message: "Missing or empty required data",
          });
          continue;
        }

        const result = await ops.deleteTranslation(resourceId, locale, key);
        if (result.success) {
          successCount++;
          results.push({
            row: rowNum,
            resourceId,
            locale,
            key,
            status: "deleted",
            message: "Success",
          });
        } else {
          failedCount++;
          results.push({
            row: rowNum,
            resourceId,
            locale,
            key,
            status: "failed",
            message: result.error ?? "Unknown error",
          });
        }
      }

      const summary = `批量删除完成。总行数: ${rows.length}, 成功: ${successCount}, 失败: ${failedCount}, 跳过: ${skippedCount}`;
      res.json({ success: true, summary, results });
    } catch (e) {
      sendResolveError(res, e, 502);
    }
  },
);

shopifyTranslationRouter.post(
  "/liquid-rule-csv-import",
  upload.single("file"),
  async (req: Request, res: Response) => {
    const shopName = String(req.body?.shopName ?? "").trim();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    if (!shopName) {
      writeSse(res, "data: 请填写 Shop Name\n\n");
      writeSse(res, "data: __COMPLETE__\n\n");
      res.end();
      return;
    }

    if (!isTsfDbConfigured()) {
      writeSse(res, "data: TSF Turso 未配置，无法写入 LiquidRule\n\n");
      writeSse(res, "data: __COMPLETE__\n\n");
      res.end();
      return;
    }

    const file = req.file;
    if (!file?.buffer?.length) {
      writeSse(res, "data: 没有上传 CSV 文件\n\n");
      writeSse(res, "data: __COMPLETE__\n\n");
      res.end();
      return;
    }

    try {
      const shop = normalizeShopName(shopName);
      writeSse(res, `data: 目标店铺: ${shop}\n\n`);
      writeSse(res, "data: 正在连接 TSF Turso...\n\n");

      const db = getTsfDb();
      const { rows, missingColumns } = parseLiquidRuleCsvBuffer(file.buffer, shop);

      if (!rows.length) {
        writeSse(res, "data: ❌ CSV 为空或无法读取表头\n\n");
        writeSse(res, "data: __COMPLETE__\n\n");
        res.end();
        return;
      }

      if (missingColumns.length) {
        writeSse(res, `data: ❌ 缺少必要列: ${missingColumns.join(", ")}\n\n`);
        writeSse(res, "data: __COMPLETE__\n\n");
        res.end();
        return;
      }

      writeSse(res, `data: 共 ${rows.length} 行，正在校验...\n\n`);

      const existingKeys = await loadExistingLiquidRuleKeys(db, shop);
      const plan = buildLiquidRuleImportPlan(rows, shop, existingKeys);

      if (plan.fileDuplicateKeys.length) {
        writeSse(
          res,
          `data: 文件内存在 ${plan.fileDuplicateKeys.length} 组重复记录（shop + sourceText + languageCode），已取消导入\n\n`,
        );
        writeSse(res, "data: __COMPLETE__\n\n");
        res.end();
        return;
      }

      if (!plan.toInsert.length) {
        writeSse(res, "data: 该文件数据均已存在于 LiquidRule，请勿重复导入\n\n");
        writeSse(res, "data: __COMPLETE__\n\n");
        res.end();
        return;
      }

      writeSse(
        res,
        `data: 校验通过：待插入 ${plan.toInsert.length} 行，跳过无效 ${plan.skipInvalidCount} 行，跳过库中已存在 ${plan.skipDbCount} 行\n\n`,
      );

      const result = await insertLiquidRules(db, plan.toInsert, (inserted, total) => {
        writeSse(
          res,
          `data: 进度 ${inserted}/${total} | 成功 ${inserted}\n\n`,
        );
      });

      for (const err of result.errors) {
        writeSse(res, `data: ${err}\n\n`);
      }

      writeSse(res, `data: ${formatLiquidRuleImportSummary(plan, result)}\n\n`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      writeSse(res, `data: ❌ 处理过程出错：${msg}\n\n`);
    }

    writeSse(res, "data: __COMPLETE__\n\n");
    res.end();
  },
);
