/**
 * READ-ONLY follow-up for xqiz3u-i1
 * node scripts/tmp-probe-xqiz3u-followup.mjs --env=.env.prod
 */
import { PrismaLibSQL } from "@prisma/adapter-libsql/web";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStackedEnv, resolveTurso } from "./lib/loadEnv.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { env } = loadStackedEnv({ root });
const turso = resolveTurso(env);
const require = createRequire(import.meta.url);
const { PrismaClient } = require("../app/generated/prisma/index.js");
const prisma = new PrismaClient({
  adapter: new PrismaLibSQL({ url: turso.url, authToken: turso.authToken }),
});

const shop = "xqiz3u-i1.myshopify.com";

const tools = await prisma.$queryRawUnsafe(
  `SELECT id, shop, feature, modelKey, rawTokens, billedTokens, inputTokens, outputTokens, createdAt
   FROM ToolTokenUsageLog WHERE shop = ? ORDER BY createdAt ASC`,
  shop,
);
console.log("=== ToolTokenUsageLog raw ===");
console.log(JSON.stringify(tools, null, 2));

const tasks = await prisma.$queryRawUnsafe(
  `SELECT id, shop, taskType, status, estimatedCredits, actualCredits, startedAt, completedAt, errorMsg, createdAt, updatedAt,
          substr(cast(config as text), 1, 500) as configPreview,
          substr(cast(result as text), 1, 600) as resultPreview
   FROM AITask WHERE shop = ? ORDER BY createdAt ASC`,
  shop,
);
console.log("\n=== AITask raw ===");
console.log(JSON.stringify(tasks, null, 2));

const logs = await prisma.$queryRawUnsafe(
  `SELECT l.taskId, l.elapsedSeconds, l.message, l.createdAt
   FROM AITaskLog l
   JOIN AITask t ON t.id = l.taskId
   WHERE t.shop = ?
   ORDER BY l.createdAt ASC`,
  shop,
);
console.log("\n=== AITaskLog ===");
console.log(JSON.stringify(logs, null, 2));

const account = await prisma.$queryRawUnsafe(
  `SELECT shop, subscriptionTokens, purchasedTokens, usedTokens, createdAt, updatedAt FROM Account WHERE shop = ?`,
  shop,
);
console.log("\n=== Account raw ===");
console.log(JSON.stringify(account, null, 2));

const msgs = await prisma.$queryRawUnsafe(
  `SELECT m.role, m.createdAt, m.content
   FROM Message m
   JOIN Conversation c ON c.id = m.conversationId
   WHERE c.shop = ?
   ORDER BY m.createdAt ASC`,
  shop,
);
console.log("\n=== Messages full ===");
for (const m of msgs) {
  console.log(`\n[${m.createdAt}] ${m.role}`);
  console.log(m.content);
}

const event = await prisma.$queryRawUnsafe(
  `SELECT eventType, topic, referenceId, payload, metadata, createdAt
   FROM CommonEventLog WHERE shop = ? ORDER BY createdAt ASC`,
  shop,
);
console.log("\n=== Events raw ===");
console.log(JSON.stringify(event, null, 2));

await prisma.$disconnect();
