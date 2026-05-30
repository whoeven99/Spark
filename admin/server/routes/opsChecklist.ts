import { Router } from "express";
import { getDb } from "../lib/db.js";
import Redis from "ioredis";
import {
  getAgentRunsContainer,
  getTranslationJobsContainer,
  isCosmosConfigured,
} from "../lib/cosmos.js";

type ServiceStatus = {
  key: string;
  name: string;
  category: "core" | "ai" | "ops";
  required: boolean;
  configured: boolean;
  note: string;
  costSignal: string;
  rechargeSignal: string;
  capacityValue: number | null;
  capacityUnit: string | null;
  warningPercent: number;
  usedValue: number | null;
  usedUnit: string | null;
  usagePercent: number | null;
  autoUsageNote?: string;
};

type ServiceBase = Omit<
  ServiceStatus,
  | "capacityValue"
  | "capacityUnit"
  | "warningPercent"
  | "usedValue"
  | "usedUnit"
  | "usagePercent"
  | "autoUsageNote"
>;

type ServiceCapacityConfig = {
  serviceKey: string;
  capacityValue: number | null;
  capacityUnit: string | null;
  warningPercent: number;
};

type AutoUsedCapacity = {
  usedValue: number | null;
  usedUnit: string | null;
  autoUsageNote?: string;
};

type PriorityLevel = "low" | "medium" | "high";

type PriorityAction = {
  title: string;
  level: PriorityLevel;
  reason: string;
  suggestion: string;
};

function hasEnv(...names: string[]): boolean {
  return names.some((name) => Boolean(process.env[name]?.trim()));
}

function buildServiceStatusesBase(): ServiceBase[] {
  return [
    {
      key: "turso-libsql",
      name: "Turso (libSQL)",
      category: "core",
      required: true,
      configured: hasEnv(
        "TURSO_TEST_DATABASE_URL",
        "TURSO_TEST_AUTH_TOKEN",
        "TURSO_PROD_DATABASE_URL",
        "TURSO_PROD_AUTH_TOKEN",
      ),
      note: "账户、订阅、计费流水、会话等主数据",
      costSignal: "连接数、写入量、存储量、查询慢日志",
      rechargeSignal: "连接接近上限、慢查询持续、写入延迟抬升",
    },
    {
      key: "azure-cosmos",
      name: "Azure Cosmos DB",
      category: "core",
      required: false,
      configured: hasEnv("COSMOS_ENDPOINT", "COSMOS_KEY"),
      note: "翻译任务与 Agent 运行日志",
      costSignal: "RU/s 消耗、429 比例、跨分区查询成本",
      rechargeSignal: "429 连续出现、RU 长时间接近上限",
    },
    {
      key: "azure-blob",
      name: "Azure Blob Storage",
      category: "core",
      required: false,
      configured: hasEnv(
        "BLOB_TRANSLATE_V3_CONNECTION_STRING",
        "AZURE_BLOB_CONNECTION_STRING",
      ),
      note: "翻译内容分块、图片翻译与文生图结果",
      costSignal: "存储容量、请求次数、出网流量",
      rechargeSignal: "存储增长过快、下载/访问费用异常",
    },
    {
      key: "redis",
      name: "Redis",
      category: "core",
      required: false,
      configured: hasEnv("REDIS_URL") || hasEnv("REDIS_HOSTNAME", "REDIS_HOST"),
      note: "翻译任务实时进度与 hint 队列",
      costSignal: "内存使用率、连接数、命中率",
      rechargeSignal: "内存接近上限、频繁 eviction",
    },
    {
      key: "llm-openai-deepseek",
      name: "OpenAI / DeepSeek",
      category: "ai",
      required: false,
      configured: hasEnv("OPENAI_API_KEY", "DEEPSEEK_API_KEY"),
      note: "AI 对话、商品描述与翻译模型调用",
      costSignal: "token 消耗速度、每功能单次成本",
      rechargeSignal: "日预算使用率 > 80% 或单日突增",
    },
    {
      key: "picture-translate-engines",
      name: "Volcengine / Aidge",
      category: "ai",
      required: false,
      configured: hasEnv("HUOSHAN_API_KEY", "VOLC_ACCESSKEY") || hasEnv("AIDGE_ACCESS_KEY_ID", "AIDGE_ACCESS_KEY_NAME"),
      note: "整图翻译双引擎路由",
      costSignal: "图片翻译请求量与每张图定额 token",
      rechargeSignal: "调用失败重试增多、余额预警",
    },
  ];
}

async function ensureCapacityTable(): Promise<void> {
  await getDb().execute(`
    CREATE TABLE IF NOT EXISTS AdminServiceCapacity (
      serviceKey TEXT PRIMARY KEY,
      capacityValue REAL,
      capacityUnit TEXT,
      warningPercent INTEGER NOT NULL DEFAULT 80,
      updatedAt TEXT NOT NULL
    )
  `);
}

let capacityTableReady: Promise<void> | null = null;

function readyCapacityTable() {
  if (!capacityTableReady) {
    capacityTableReady = ensureCapacityTable().catch((error) => {
      capacityTableReady = null;
      throw error;
    });
  }
  return capacityTableReady;
}

async function listCapacityConfigMap(): Promise<Record<string, ServiceCapacityConfig>> {
  await readyCapacityTable();
  const result = await getDb().execute(
    "SELECT serviceKey, capacityValue, capacityUnit, warningPercent FROM AdminServiceCapacity",
  );
  const map: Record<string, ServiceCapacityConfig> = {};
  for (const row of result.rows) {
    const key = String(row.serviceKey ?? "");
    if (!key) continue;
    map[key] = {
      serviceKey: key,
      capacityValue:
        row.capacityValue == null ? null : Number(row.capacityValue),
      capacityUnit: row.capacityUnit == null ? null : String(row.capacityUnit),
      warningPercent: Math.min(
        100,
        Math.max(1, Number(row.warningPercent ?? 80)),
      ),
    };
  }
  return map;
}

function buildRedisClient(): Redis | null {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUrl) {
    return new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
    });
  }

  const host =
    process.env.REDIS_HOSTNAME?.trim() ||
    process.env.REDIS_HOST?.trim() ||
    "";
  if (!host) return null;

  return new Redis({
    host,
    port: Number(process.env.REDIS_PORT ?? 6380),
    password:
      process.env.REDIS_PASSWORD?.trim() ||
      process.env.REDIS_CACHEKEY_VAULT?.trim() ||
      undefined,
    tls:
      process.env.REDIS_TLS?.trim().toLowerCase() === "false"
        ? undefined
        : {},
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
  });
}

async function getAutoUsedCapacityMap(): Promise<Record<string, AutoUsedCapacity>> {
  const db = getDb();
  const map: Record<string, AutoUsedCapacity> = {};

  try {
    const tursoUsed = await db.execute(
      "SELECT SUM(usedTokens) AS totalUsedTokens FROM Account",
    );
    map["turso-libsql"] = {
      usedValue: Number(tursoUsed.rows[0]?.totalUsedTokens ?? 0),
      usedUnit: "tokens",
      autoUsageNote: "自动读取 Account.usedTokens 汇总",
    };
  } catch {
    map["turso-libsql"] = {
      usedValue: null,
      usedUnit: "tokens",
      autoUsageNote: "自动读取失败",
    };
  }

  try {
    const llmUsed = await db.execute(`
      SELECT SUM(CASE WHEN tokensDelta < 0 THEN ABS(tokensDelta) ELSE 0 END) AS used30d
      FROM BillingLog
      WHERE createdAt >= datetime('now', '-30 days')
    `);
    map["llm-openai-deepseek"] = {
      usedValue: Number(llmUsed.rows[0]?.used30d ?? 0),
      usedUnit: "tokens",
      autoUsageNote: "自动读取 BillingLog 最近30天消耗",
    };
  } catch {
    map["llm-openai-deepseek"] = {
      usedValue: null,
      usedUnit: "tokens",
      autoUsageNote: "自动读取失败",
    };
  }

  if (isCosmosConfigured()) {
    try {
      const translationContainer = getTranslationJobsContainer();
      const agentRunsContainer = getAgentRunsContainer();
      const [translationCount, agentCount] = await Promise.all([
        translationContainer.items
          .query<number>({ query: "SELECT VALUE COUNT(1) FROM c" })
          .fetchAll(),
        agentRunsContainer.items
          .query<number>({ query: "SELECT VALUE COUNT(1) FROM c" })
          .fetchAll(),
      ]);
      map["azure-cosmos"] = {
        usedValue:
          Number(translationCount.resources[0] ?? 0) +
          Number(agentCount.resources[0] ?? 0),
        usedUnit: "docs",
        autoUsageNote: "自动读取 translation_jobs + agent_runs 文档数",
      };
    } catch {
      map["azure-cosmos"] = {
        usedValue: null,
        usedUnit: "docs",
        autoUsageNote: "自动读取失败",
      };
    }
  } else {
    map["azure-cosmos"] = {
      usedValue: null,
      usedUnit: "docs",
      autoUsageNote: "Cosmos 未配置",
    };
  }

  const redisClient = buildRedisClient();
  if (redisClient) {
    try {
      await redisClient.connect();
      const info = await redisClient.info("memory");
      const usedMemory = Number(
        (info.match(/used_memory:(\d+)/)?.[1] ?? "0"),
      );
      map["redis"] = {
        usedValue: Number((usedMemory / (1024 * 1024)).toFixed(2)),
        usedUnit: "MB",
        autoUsageNote: "自动读取 Redis used_memory",
      };
    } catch {
      map["redis"] = {
        usedValue: null,
        usedUnit: "MB",
        autoUsageNote: "自动读取失败",
      };
    } finally {
      redisClient.disconnect();
    }
  } else {
    map["redis"] = {
      usedValue: null,
      usedUnit: "MB",
      autoUsageNote: "Redis 未配置",
    };
  }

  map["azure-blob"] = {
    usedValue: null,
    usedUnit: "GB",
    autoUsageNote: "自动读取待接入 Blob SDK",
  };

  map["picture-translate-engines"] = {
    usedValue: null,
    usedUnit: "requests",
    autoUsageNote: "自动读取待接入供应商计量接口",
  };

  return map;
}

function getMonitoringChecklist() {
  return [
    {
      frequency: "daily",
      title: "Token 与订阅风险巡检",
      checks: [
        "高使用率商店（>=80%）数量",
        "接近耗尽商店（>=90%）数量",
        "近 7 天 TOKEN_PACK_PURCHASED 次数",
        "7 天内即将到期订阅数量",
      ],
    },
    {
      frequency: "daily",
      title: "翻译与 AI 任务健康",
      checks: [
        "翻译任务失败数与活动任务数",
        "Agent Runs 错误率与 timeout 比例",
        "外部 API 调用失败是否集中在单一服务",
      ],
    },
    {
      frequency: "weekly",
      title: "数据库与存储容量评估",
      checks: [
        "Account/BillingLog 增长速度",
        "Cosmos RU 峰值与 429 趋势",
        "Blob 容量增速与历史归档策略",
        "Redis 内存与键 TTL 是否健康",
      ],
    },
    {
      frequency: "monthly",
      title: "成本与扩容决策",
      checks: [
        "外部模型与图片翻译渠道成本占比",
        "Turso/Cosmos/Blob 是否达到套餐阈值",
        "预算执行偏差与下月预算",
      ],
    },
  ];
}

async function getTranslationHealth(): Promise<{ active: number; failed: number; paused: number; completed24h: number; note?: string; }> {
  if (!isCosmosConfigured()) {
    return { active: 0, failed: 0, paused: 0, completed24h: 0, note: "Cosmos 未配置" };
  }

  try {
    const container = getTranslationJobsContainer();
    const completedCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [statusResult, completedResult] = await Promise.all([
      container.items
        .query<{ status: string; total: number }>({
          query: "SELECT c.status, COUNT(1) AS total FROM c GROUP BY c.status",
        })
        .fetchAll(),
      container.items
        .query<{ total: number }>({
          query: "SELECT VALUE COUNT(1) FROM c WHERE c.status = 'COMPLETED' AND c.updatedAt >= @cutoff",
          parameters: [{ name: "@cutoff", value: completedCutoff }],
        })
        .fetchAll(),
    ]);

    const activeStatuses = new Set([
      "INIT_QUEUED",
      "INITIALIZING",
      "TRANSLATE_QUEUED",
      "TRANSLATING",
      "WRITEBACK_QUEUED",
      "WRITING_BACK",
      "VERIFY_QUEUED",
      "VERIFYING",
      "INIT_DONE",
      "TRANSLATE_DONE",
    ]);

    let active = 0;
    let failed = 0;
    let paused = 0;
    for (const row of statusResult.resources) {
      const count = Number(row.total ?? 0);
      if (activeStatuses.has(row.status)) active += count;
      if (row.status === "FAILED") failed += count;
      if (row.status === "PAUSED") paused += count;
    }

    const completed24h = Number(completedResult.resources[0] ?? 0);
    return { active, failed, paused, completed24h };
  } catch (error) {
    console.error("[ops-checklist][translation-health]", error);
    return { active: 0, failed: 0, paused: 0, completed24h: 0, note: "翻译任务统计查询失败" };
  }
}

export const opsChecklistRouter = Router();

opsChecklistRouter.put("/capacity/:serviceKey", async (req, res) => {
  try {
    await readyCapacityTable();
    const serviceKey = String(req.params.serviceKey ?? "").trim();
    const allowed = new Set(buildServiceStatusesBase().map((s) => s.key));
    if (!allowed.has(serviceKey)) {
      res.status(400).json({ error: "invalid serviceKey" });
      return;
    }

    const rawValue = req.body?.capacityValue;
    const rawUnit = req.body?.capacityUnit;
    const rawWarning = req.body?.warningPercent;

    const capacityValue =
      rawValue == null || rawValue === ""
        ? null
        : Number.isFinite(Number(rawValue))
          ? Math.max(0, Number(rawValue))
          : null;
    const capacityUnit =
      rawUnit == null || String(rawUnit).trim() === ""
        ? null
        : String(rawUnit).trim().slice(0, 24);
    const warningPercent =
      rawWarning == null || rawWarning === ""
        ? 80
        : Math.min(100, Math.max(1, Math.floor(Number(rawWarning))));

    const now = new Date().toISOString();
    await getDb().execute({
      sql: `
        INSERT INTO AdminServiceCapacity (serviceKey, capacityValue, capacityUnit, warningPercent, updatedAt)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(serviceKey) DO UPDATE SET
          capacityValue=excluded.capacityValue,
          capacityUnit=excluded.capacityUnit,
          warningPercent=excluded.warningPercent,
          updatedAt=excluded.updatedAt
      `,
      args: [serviceKey, capacityValue, capacityUnit, warningPercent, now],
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("[ops-checklist/capacity]", err);
    res.status(500).json({ error: String(err) });
  }
});

opsChecklistRouter.get("/", async (_req, res) => {
  try {
    const db = getDb();

    const [capacityConfigMap, autoUsedMap] = await Promise.all([
      listCapacityConfigMap(),
      getAutoUsedCapacityMap(),
    ]);

    const [
      accountRiskResult,
      subscriptionExpiringResult,
      billingRecentResult,
      eventRecentResult,
      topUsageResult,
      topEventsResult,
      translationHealth,
    ] = await Promise.all([
      db.execute(`
        SELECT
          COUNT(*) AS totalAccounts,
          SUM(CASE WHEN (subscriptionTokens + purchasedTokens + trialTokens) > 0
            AND usedTokens * 1.0 / (subscriptionTokens + purchasedTokens + trialTokens) >= 0.8 THEN 1 ELSE 0 END) AS highUsage80,
          SUM(CASE WHEN (subscriptionTokens + purchasedTokens + trialTokens) > 0
            AND usedTokens * 1.0 / (subscriptionTokens + purchasedTokens + trialTokens) >= 0.9 THEN 1 ELSE 0 END) AS highUsage90,
          SUM(CASE WHEN (subscriptionTokens + purchasedTokens + trialTokens) > 0
            AND usedTokens >= (subscriptionTokens + purchasedTokens + trialTokens) THEN 1 ELSE 0 END) AS depleted
        FROM Account
      `),
      db.execute(`
        SELECT
          COUNT(*) AS expiringIn7d
        FROM AppSubscription
        WHERE status = 'ACTIVE'
          AND currentPeriodEnd IS NOT NULL
          AND currentPeriodEnd <= datetime('now', '+7 days')
      `),
      db.execute(`
        SELECT
          COUNT(*) AS billingEvents7d,
          SUM(CASE WHEN eventType = 'TOKEN_PACK_PURCHASED' THEN 1 ELSE 0 END) AS tokenPackPurchased7d,
          SUM(CASE WHEN eventType = 'SUBSCRIPTION_RENEWED' THEN 1 ELSE 0 END) AS subscriptionRenewed7d
        FROM BillingLog
        WHERE createdAt >= datetime('now', '-7 days')
      `),
      db.execute(`
        SELECT
          SUM(CASE WHEN eventType = 'APP_UNINSTALLED' THEN 1 ELSE 0 END) AS uninstall7d,
          SUM(CASE WHEN eventType = 'SCOPES_UPDATE' THEN 1 ELSE 0 END) AS scopesUpdate7d
        FROM CommonEventLog
        WHERE createdAt >= datetime('now', '-7 days')
      `),
      db.execute(`
        SELECT
          shop,
          appName,
          usedTokens,
          (subscriptionTokens + purchasedTokens + trialTokens) AS totalTokens,
          CASE
            WHEN (subscriptionTokens + purchasedTokens + trialTokens) > 0
            THEN ROUND(usedTokens * 100.0 / (subscriptionTokens + purchasedTokens + trialTokens), 1)
            ELSE 0
          END AS usagePercent
        FROM Account
        ORDER BY usagePercent DESC, usedTokens DESC
        LIMIT 8
      `),
      db.execute(`
        SELECT
          eventType,
          COUNT(*) AS total
        FROM BillingLog
        WHERE createdAt >= datetime('now', '-7 days')
        GROUP BY eventType
        ORDER BY total DESC
        LIMIT 6
      `),
      getTranslationHealth(),
    ]);

    const accountRisk = accountRiskResult.rows[0] ?? {};
    const subscriptionExpiring = subscriptionExpiringResult.rows[0] ?? {};
    const billingRecent = billingRecentResult.rows[0] ?? {};
    const eventRecent = eventRecentResult.rows[0] ?? {};

    const riskHigh90 = Number(accountRisk.highUsage90 ?? 0);
    const riskDepleted = Number(accountRisk.depleted ?? 0);
    const expiringIn7d = Number(subscriptionExpiring.expiringIn7d ?? 0);

    const priorityActions: PriorityAction[] = [];

    if (riskDepleted > 0) {
      priorityActions.push({
        title: "存在已耗尽 Token 商店",
        level: "high",
        reason: `${riskDepleted} 家商店当前已达到或超过 token 配额。`,
        suggestion: "优先联系商户续费或购包，并检查高耗能功能是否异常重试。",
      });
    }

    if (riskHigh90 >= 5) {
      priorityActions.push({
        title: "高风险商店数量偏高",
        level: "high",
        reason: `使用率 >=90% 的商店数为 ${riskHigh90}。`,
        suggestion: "配置自动预警并提前引导充值，避免功能被动拦截。",
      });
    }

    if (expiringIn7d >= 5) {
      priorityActions.push({
        title: "近期到期订阅较多",
        level: "medium",
        reason: `${expiringIn7d} 个活跃订阅将在 7 天内到期。`,
        suggestion: "安排续费提醒与运营触达，降低流失。",
      });
    }

    if (translationHealth.failed > 0) {
      priorityActions.push({
        title: "翻译任务有失败积压",
        level: "medium",
        reason: `当前 FAILED 任务数量为 ${translationHealth.failed}。`,
        suggestion: "排查 Cosmos/Redis/外部翻译 API 异常并清理失败重试队列。",
      });
    }

    if (priorityActions.length === 0) {
      priorityActions.push({
        title: "核心指标总体平稳",
        level: "low",
        reason: "暂无明显高风险项。",
        suggestion: "按日常频率继续巡检并保持告警阈值。",
      });
    }

    const services: ServiceStatus[] = buildServiceStatusesBase().map((base) => {
      const cfg = capacityConfigMap[base.key];
      const auto = autoUsedMap[base.key];
      const capacityValue = cfg?.capacityValue ?? null;
      const capacityUnit = cfg?.capacityUnit ?? null;
      const warningPercent = cfg?.warningPercent ?? 80;
      const usedValue = auto?.usedValue ?? null;
      const usedUnit = auto?.usedUnit ?? null;
      const usagePercent =
        capacityValue != null &&
        capacityValue > 0 &&
        usedValue != null &&
        capacityUnit != null &&
        usedUnit != null &&
        capacityUnit.toLowerCase() === usedUnit.toLowerCase()
          ? Number(((usedValue / capacityValue) * 100).toFixed(1))
          : null;

      return {
        ...base,
        capacityValue,
        capacityUnit,
        warningPercent,
        usedValue,
        usedUnit,
        usagePercent,
        autoUsageNote: auto?.autoUsageNote,
      };
    });

    res.json({
      generatedAt: new Date().toISOString(),
      technologyStack: {
        frontend: ["React 18", "TypeScript", "Ant Design", "React Router", "Vite"],
        backend: ["Node.js", "Express", "TypeScript", "@libsql/client"],
        dataInfra: ["Turso/libSQL", "Azure Cosmos DB", "Azure Blob Storage", "Redis"],
        ai: ["LangGraph", "LangChain", "OpenAI/DeepSeek", "Volcengine", "Aidge"],
        ops: ["Shopify Admin GraphQL", "Tencent SES", "Feishu Webhook", "LangSmith"],
      },
      services,
      metrics: {
        totalAccounts: Number(accountRisk.totalAccounts ?? 0),
        highUsage80: Number(accountRisk.highUsage80 ?? 0),
        highUsage90: riskHigh90,
        depleted: riskDepleted,
        expiringIn7d,
        billingEvents7d: Number(billingRecent.billingEvents7d ?? 0),
        tokenPackPurchased7d: Number(billingRecent.tokenPackPurchased7d ?? 0),
        subscriptionRenewed7d: Number(billingRecent.subscriptionRenewed7d ?? 0),
        uninstall7d: Number(eventRecent.uninstall7d ?? 0),
        scopesUpdate7d: Number(eventRecent.scopesUpdate7d ?? 0),
        translation: translationHealth,
      },
      topUsageShops: topUsageResult.rows.map((row) => ({
        shop: row.shop as string,
        appName: row.appName as string,
        usedTokens: Number(row.usedTokens ?? 0),
        totalTokens: Number(row.totalTokens ?? 0),
        usagePercent: Number(row.usagePercent ?? 0),
      })),
      billingEventTop7d: topEventsResult.rows.map((row) => ({
        eventType: row.eventType as string,
        total: Number(row.total ?? 0),
      })),
      priorityActions,
      checklist: getMonitoringChecklist(),
    });
  } catch (err) {
    console.error("[ops-checklist]", err);
    res.status(500).json({ error: String(err) });
  }
});
