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

function hasEnv(...names: string[]): boolean {
  return names.some((name) => Boolean(process.env[name]?.trim()));
}

function buildServiceStatuses(): ServiceStatus[] {
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
      configured: hasEnv("AZURE_BLOB_CONNECTION_STRING"),
      note: "翻译内容分块、图片翻译与文生图结果",
      costSignal: "存储容量、请求次数、出网流量",
      rechargeSignal: "存储增长过快、下载/访问费用异常",
    },
    {
      key: "redis",
      name: "Redis",
      category: "core",
      required: false,
      configured: hasEnv("REDIS_URL"),
      note: "翻译任务实时进度（REDIS_URL）与 hint 队列",
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
      configured:
        hasEnv("HUOSHAN_API_KEY", "VOLC_ACCESSKEY") ||
        hasEnv("AIDGE_ACCESS_KEY_ID", "AIDGE_ACCESS_KEY_NAME"),
      note: "整图翻译双引擎路由",
      costSignal: "图片翻译请求量与每张图定额 token",
      rechargeSignal: "调用失败重试增多、余额预警",
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
