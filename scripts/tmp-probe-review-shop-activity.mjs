import { PrismaLibSQL } from "@prisma/adapter-libsql/web";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStackedEnv, resolveTurso } from "./lib/loadEnv.mjs";

process.argv.push("--env=.env.prod");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { env } = loadStackedEnv({ root });
const turso = resolveTurso(env);
console.log("Turso host:", new URL(turso.url).host, "now:", new Date().toISOString());

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../app/generated/prisma/index.js");
const prisma = new PrismaClient({
  adapter: new PrismaLibSQL({ url: turso.url, authToken: turso.authToken }),
});

const shops = [
  "app-review-01d87a12-r85904-a0-primary.myshopify.com",
  "app-review-01d87a12-r85904-a0-victim.myshopify.com",
];

for (const shop of shops) {
  console.log("\n========", shop, "========");
  const account = await prisma.account.findUnique({ where: { shop } });
  const sub = await prisma.appSubscription.findUnique({ where: { shop } });
  console.log("Account:", account ? {
    purchasedTokens: account.purchasedTokens,
    usedTokens: account.usedTokens,
    updatedAt: account.updatedAt,
  } : null);
  console.log("AppSubscription:", sub);

  const tasks = await prisma.aITask.findMany({
    where: { shop },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });
  console.log("AITasks:", tasks.map(t => {
    const keys = Object.keys(t);
    return {
      id: t.id,
      status: t.status,
      taskType: t.taskType ?? t.type ?? t.kind,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      keys: keys.filter(k => !["config","result","payload","input","output","error"].includes(k)),
    };
  }));

  const batches = await prisma.aITaskBatch.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  console.log("Batches:", batches.map(b => ({
    id: b.id,
    taskType: b.taskType,
    createdAt: b.createdAt,
  })));

  const messages = await prisma.message.findMany({
    where: { conversation: { shop } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { role: true, createdAt: true, content: true },
  });
  console.log("Messages:", messages.map(m => ({
    role: m.role,
    createdAt: m.createdAt,
    preview: String(m.content || "").replace(/\s+/g, " ").slice(0, 100),
  })));

  let toolUsage = [];
  try {
    toolUsage = await prisma.toolTokenUsageLog.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 15,
    });
  } catch (e) {
    console.log("ToolTokenUsageLog skip:", e.message.split("\n")[0]);
  }
  console.log("ToolUsage:", toolUsage.map(u => ({
    feature: u.feature,
    createdAt: u.createdAt,
    tokens: u.totalTokens ?? u.promptTokens ?? u.tokens,
  })));

  let events = [];
  try {
    events = await prisma.commonEventLog.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 15,
    });
  } catch (e) {
    console.log("CommonEventLog skip:", e.message.split("\n")[0]);
  }
  console.log("Events:", events.map(e => ({
    type: e.eventType ?? e.type,
    createdAt: e.createdAt,
  })));

  const times = [
    account?.updatedAt,
    ...tasks.map(t => t.updatedAt),
    ...messages.map(m => m.createdAt),
    ...toolUsage.map(u => u.createdAt),
    ...events.map(e => e.createdAt),
  ].filter(Boolean).map(d => new Date(d).getTime());
  const last = times.length ? new Date(Math.max(...times)) : null;
  const ageMin = last ? Math.round((Date.now() - last.getTime()) / 60000) : null;
  console.log("LAST_ACTIVITY:", last?.toISOString(), ageMin != null ? `(${ageMin} min ago)` : "");
}

await prisma.$disconnect();
