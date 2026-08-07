/**
 * 导出翻译任务 blob 内容（翻译前 + 翻译成本及对应关系）。
 *
 * 用法：
 *   node scripts/export-translation-content.mjs <jobId> [--shop <shopName>] [--out <dir>] [--env-file <path>]
 *
 * 输出：
 *   - <jobId>.json          嵌套结构（资源 → 字段 → cost.calls）
 *   - <jobId>-fields.csv    每字段一行（原文、译文、成本汇总）
 *   - <jobId>-calls.csv     每次 LLM/Google 调用一行（关联 resourceId + fieldKey）
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CosmosClient } from "@azure/cosmos";
import { BlobServiceClient } from "@azure/storage-blob";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadDotEnv(filePath, override = false) {
  if (!existsSync(filePath)) return;
  for (const raw of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (override || !process.env[key]) process.env[key] = value;
  }
}

function env(name, fallback) {
  const v = process.env[name]?.trim();
  return v || fallback;
}

function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`缺少环境变量: ${name}`);
  return v;
}

function jobContainerName() {
  return env("COSMOS_TRANSLATION_V4_JOBS_CONTAINER", "translation_v4_jobs");
}

function parseArgs(argv) {
  const args = { jobId: "", shop: "", outDir: path.join(root, "exports"), envFile: "" };
  const rest = [...argv];
  if (rest.length > 0 && !rest[0].startsWith("--")) {
    args.jobId = rest.shift();
  }
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === "--shop" && rest[i + 1]) {
      args.shop = rest[++i];
    } else if (a === "--out" && rest[i + 1]) {
      args.outDir = path.resolve(rest[++i]);
    } else if (a === "--env-file" && rest[i + 1]) {
      args.envFile = path.resolve(rest[++i]);
    }
  }
  if (!args.jobId) {
    throw new Error("请提供 jobId，例如: node scripts/export-translation-content.mjs <jobId>");
  }
  return args;
}

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function flattenCalls(cost) {
  if (!cost) return [];
  if (cost.calls?.length) return cost.calls;
  if (cost.provider === "llm" || cost.provider === "google") return [cost];
  return [];
}

function summarizeCost(cost) {
  if (!cost) return { provider: "", callCount: 0, inputTokens: 0, outputTokens: 0, chars: 0 };
  const calls = flattenCalls(cost);
  if (calls.length === 0) {
    return {
      provider: cost.provider ?? "",
      callCount: 0,
      inputTokens: cost.inputTokens ?? 0,
      outputTokens: cost.outputTokens ?? 0,
      chars: cost.chars ?? 0,
    };
  }
  return {
    provider: cost.provider ?? calls[0]?.provider ?? "",
    callCount: calls.length,
    inputTokens: calls.reduce((n, c) => n + (c.inputTokens ?? 0), 0),
    outputTokens: calls.reduce((n, c) => n + (c.outputTokens ?? 0), 0),
    chars: calls.reduce((n, c) => n + (c.chars ?? 0), 0),
  };
}

async function getJob(client, jobId, shop) {
  const db = env("COSMOS_TRANSLATION_DATABASE_ID", "translation");
  const containerName = jobContainerName();
  const container = client.database(db).container(containerName);

  if (shop) {
    const { resource } = await container.item(jobId, shop).read();
    return resource ?? null;
  }

  const { resources } = await container.items
    .query({
      query: "SELECT c.id, c.shopName, c.modules, c.blobPrefix, c.status, c.targetLocale FROM c WHERE c.id = @id",
      parameters: [{ name: "@id", value: jobId }],
    })
    .fetchAll();
  return resources[0] ?? null;
}

async function blobRead(container, blobPath) {
  const client = container.getBlockBlobClient(blobPath);
  if (!(await client.exists())) return null;
  const buf = await client.downloadToBuffer();
  return JSON.parse(buf.toString("utf8"));
}

async function blobListPaths(container, prefix) {
  const paths = [];
  for await (const item of container.listBlobsFlat({ prefix })) {
    paths.push(item.name);
  }
  return paths;
}

async function main() {
  const { jobId, shop, outDir, envFile } = parseArgs(process.argv.slice(2));
  if (envFile) {
    loadDotEnv(envFile, true);
  } else {
    loadDotEnv(path.join(root, ".env"));
  }

  const cosmosEndpoint = requireEnv("COSMOS_ENDPOINT");
  const cosmosKey = requireEnv("COSMOS_KEY");
  const blobConn = requireEnv("AZURE_BLOB_CONNECTION_STRING");
  const blobContainerName = env("AZURE_BLOB_TRANSLATION_CONTAINER", "translation-content");

  const cosmos = new CosmosClient({ endpoint: cosmosEndpoint, key: cosmosKey });
  const job = await getJob(cosmos, jobId, shop);
  if (!job) {
    throw new Error(`未找到任务 ${jobId}${shop ? ` (shop=${shop})` : ""}`);
  }
  if (!job.blobPrefix) {
    throw new Error(`任务 ${jobId} 无 blobPrefix，可能是旧任务`);
  }

  const blobContainer = BlobServiceClient.fromConnectionString(blobConn).getContainerClient(
    blobContainerName,
  );

  const modules = job.modules ?? [];
  const exportData = {
    jobId: job.id,
    shopName: job.shopName,
    targetLocale: job.targetLocale ?? null,
    status: job.status ?? null,
    modules: [],
  };

  const fieldRows = [];
  const callRows = [];

  for (const module of modules) {
    const resourcePrefix = `${job.blobPrefix}/translate/${module}/resources/`;
    const resourcePaths = (await blobListPaths(blobContainer, resourcePrefix))
      .filter((p) => p.endsWith(".json"))
      .sort();

    const moduleEntry = { module, resources: [] };

    for (const blobPath of resourcePaths) {
      const resource = await blobRead(blobContainer, blobPath);
      if (!resource?.resourceId || !Array.isArray(resource.translations)) continue;

      const resourceEntry = {
        resourceId: resource.resourceId,
        fields: [],
      };

      for (const field of resource.translations) {
        const summary = summarizeCost(field.cost);
        const calls = flattenCalls(field.cost).map((call, index) => ({
          callIndex: index + 1,
          provider: call.provider ?? "",
          model: call.model ?? "",
          batchSize: call.batchSize ?? null,
          requestId: call.requestId ?? "",
          inputTokens: call.inputTokens ?? null,
          outputTokens: call.outputTokens ?? null,
          totalTokens: call.totalTokens ?? null,
          chars: call.chars ?? null,
        }));

        const fieldEntry = {
          key: field.key,
          status: field.status ?? "",
          digest: field.digest ?? "",
          originalValue: field.originalValue ?? "",
          translatedValue: field.translatedValue ?? "",
          cost: field.cost ?? null,
          costSummary: summary,
          calls,
        };
        resourceEntry.fields.push(fieldEntry);

        fieldRows.push({
          module,
          resourceId: resource.resourceId,
          fieldKey: field.key,
          status: field.status ?? "",
          originalValue: field.originalValue ?? "",
          translatedValue: field.translatedValue ?? "",
          costProvider: summary.provider,
          costCallCount: summary.callCount,
          costInputTokens: summary.inputTokens,
          costOutputTokens: summary.outputTokens,
          costChars: summary.chars,
        });

        for (const call of calls) {
          callRows.push({
            module,
            resourceId: resource.resourceId,
            fieldKey: field.key,
            originalValue: field.originalValue ?? "",
            callIndex: call.callIndex,
            provider: call.provider,
            model: call.model,
            batchSize: call.batchSize ?? "",
            requestId: call.requestId,
            inputTokens: call.inputTokens ?? "",
            outputTokens: call.outputTokens ?? "",
            totalTokens: call.totalTokens ?? "",
            chars: call.chars ?? "",
          });
        }
      }

      moduleEntry.resources.push(resourceEntry);
    }

    exportData.modules.push(moduleEntry);
  }

  mkdirSync(outDir, { recursive: true });
  const base = path.join(outDir, jobId);

  writeFileSync(`${base}.json`, JSON.stringify(exportData, null, 2), "utf8");

  const fieldHeader = [
    "module",
    "resourceId",
    "fieldKey",
    "status",
    "originalValue",
    "translatedValue",
    "costProvider",
    "costCallCount",
    "costInputTokens",
    "costOutputTokens",
    "costChars",
  ];
  const fieldCsv = [
    fieldHeader.join(","),
    ...fieldRows.map((r) => fieldHeader.map((h) => csvEscape(r[h])).join(",")),
  ].join("\n");
  writeFileSync(`${base}-fields.csv`, `\uFEFF${fieldCsv}`, "utf8");

  const callHeader = [
    "module",
    "resourceId",
    "fieldKey",
    "originalValue",
    "callIndex",
    "provider",
    "model",
    "batchSize",
    "requestId",
    "inputTokens",
    "outputTokens",
    "totalTokens",
    "chars",
  ];
  const callCsv = [
    callHeader.join(","),
    ...callRows.map((r) => callHeader.map((h) => csvEscape(r[h])).join(",")),
  ].join("\n");
  writeFileSync(`${base}-calls.csv`, `\uFEFF${callCsv}`, "utf8");

  const totalFields = fieldRows.length;
  const totalCalls = callRows.length;
  const totalResources = exportData.modules.reduce((n, m) => n + m.resources.length, 0);

  console.log(`任务: ${job.id}`);
  console.log(`店铺: ${job.shopName}`);
  console.log(`模块: ${modules.join(", ") || "(无)"}`);
  console.log(`资源数: ${totalResources}，字段数: ${totalFields}，LLM/Google 调用数: ${totalCalls}`);
  console.log(`已导出:`);
  console.log(`  ${base}.json`);
  console.log(`  ${base}-fields.csv`);
  console.log(`  ${base}-calls.csv`);
  console.log("");
  console.log("对应关系说明:");
  console.log("  - fields.csv: 每个 Shopify 字段一行，originalValue 对应该字段全部原文");
  console.log("  - calls.csv:  每次 LLM/Google 调用一行，通过 resourceId + fieldKey 关联到 fields.csv");
  console.log("  - batchSize:  该次 LLM 请求打包的文本单元数（非第几批）");
  console.log("  - HTML/JSON 大字段会拆成多个 leaf 后分批翻译，故一个字段可能有多条 calls");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
