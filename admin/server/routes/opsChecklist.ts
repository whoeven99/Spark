import { Router } from "express";

export const opsChecklistRouter = Router();

type ServiceStatus = {
  key: string;
  name: string;
  category: "core" | "ai" | "ops";
  required: boolean;
  configured: boolean;
  note: string;
  costSignal: string;
  rechargeSignal: string;
};

function hasAllEnv(...names: string[]): boolean {
  return names.every((name) => Boolean(process.env[name]?.trim()));
}

function hasAnyEnv(...names: string[]): boolean {
  return names.some((name) => Boolean(process.env[name]?.trim()));
}

function buildServiceStatuses(): ServiceStatus[] {
  return [
    {
      key: "spark-turso",
      name: "Spark Turso",
      category: "core",
      required: true,
      configured: hasAllEnv("SPARK_DATABASE_URL", "SPARK_DATABASE_AUTH_TOKEN"),
      note: "账户、订阅、计费流水、会话等（SPARK_DATABASE_URL / SPARK_DATABASE_AUTH_TOKEN）",
      costSignal: "连接数、写入量、存储量、查询慢日志",
      rechargeSignal: "连接接近上限、慢查询持续、写入延迟抬升",
    },
    {
      key: "tsf-turso",
      name: "TSF Turso",
      category: "core",
      required: false,
      configured: hasAllEnv("TSF_DATABASE_URL", "TSF_DATABASE_AUTH_TOKEN"),
      note: "翻译 Tab / 额度观测（TSF_DATABASE_URL / TSF_DATABASE_AUTH_TOKEN）",
      costSignal: "连接数、写入量、查询延迟",
      rechargeSignal: "连接接近上限、慢查询持续",
    },
    {
      key: "azure-cosmos",
      name: "Azure Cosmos DB",
      category: "core",
      required: false,
      configured: hasAllEnv("COSMOS_ENDPOINT", "COSMOS_KEY"),
      note: "翻译任务与 Agent 运行日志（COSMOS_ENDPOINT / COSMOS_KEY）",
      costSignal: "RU/s 消耗、429 比例、跨分区查询成本",
      rechargeSignal: "429 连续出现、RU 长时间接近上限",
    },
    {
      key: "azure-blob",
      name: "Azure Blob Storage",
      category: "core",
      required: false,
      configured: hasAnyEnv("AZURE_BLOB_CONNECTION_STRING"),
      note: "翻译 Blob / shop-profile 产物（AZURE_BLOB_CONNECTION_STRING）",
      costSignal: "存储容量、请求次数、出网流量",
      rechargeSignal: "存储增长过快、下载/访问费用异常",
    },
    {
      key: "redis",
      name: "Redis (RENDER_KV)",
      category: "core",
      required: false,
      configured: hasAnyEnv("RENDER_KV"),
      note: "TSF 翻译运维只读 / hint（RENDER_KV）",
      costSignal: "内存使用率、连接数、命中率",
      rechargeSignal: "内存接近上限、频繁 eviction",
    },
    {
      key: "openrouter",
      name: "OpenRouter",
      category: "ai",
      required: false,
      configured: hasAnyEnv("OPENROUTER_API_KEY"),
      note: "Admin OpenRouter 探测页（OPENROUTER_API_KEY）",
      costSignal: "探测调用额度",
      rechargeSignal: "额度不足 / 探测失败",
    },
    {
      key: "aliyun-sls",
      name: "Aliyun SLS",
      category: "ops",
      required: false,
      configured: hasAllEnv(
        "ALIBABA_CLOUD_ACCESS_KEY_ID",
        "ALIBABA_CLOUD_ACCESS_KEY_SECRET",
        "ALIBABA_CLOUD_ENDPOINT",
      ),
      note: "Pixel / App 日志（ALIBABA_CLOUD_*）",
      costSignal: "写入量、查询流量",
      rechargeSignal: "查询失败或配额告警",
    },
  ];
}

opsChecklistRouter.get("/", async (_req, res) => {
  try {
    res.json({
      generatedAt: new Date().toISOString(),
      services: buildServiceStatuses(),
    });
  } catch (err) {
    console.error("[ops-checklist]", err);
    res.status(500).json({ error: String(err) });
  }
});
