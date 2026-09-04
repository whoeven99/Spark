/**
 * READ-ONLY prod probe for xqiz3u-i1.myshopify.com
 * Usage: node scripts/tmp-probe-xqiz3u-activity.mjs --env=.env.prod
 */
import { PrismaLibSQL } from "@prisma/adapter-libsql/web";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStackedEnv, resolveTurso } from "./lib/loadEnv.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { env } = loadStackedEnv({ root });
const turso = resolveTurso(env);
console.log("Turso host:", new URL(turso.url).host, "now:", new Date().toISOString());

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../app/generated/prisma/index.js");
const prisma = new PrismaClient({
  adapter: new PrismaLibSQL({ url: turso.url, authToken: turso.authToken }),
});

const shop = "xqiz3u-i1.myshopify.com";
console.log("\n========", shop, "========");

function preview(v, n = 160) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .slice(0, n);
}

const account = await prisma.account.findUnique({ where: { shop } });
console.log("\n=== Account ===");
console.log(
  account
    ? {
        shop: account.shop,
        subscriptionTokens: account.subscriptionTokens,
        purchasedTokens: account.purchasedTokens,
        usedTokens: account.usedTokens,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      }
    : null,
);

const sub = await prisma.appSubscription.findUnique({ where: { shop } });
console.log("\n=== AppSubscription ===");
console.log(sub);

const billingLogs = await prisma.billingLog.findMany({
  where: { shop },
  orderBy: { createdAt: "desc" },
  take: 40,
});
console.log("\n=== BillingLog ===");
for (const b of billingLogs) {
  console.log({
    eventType: b.eventType,
    planKey: b.planKey,
    tokensDelta: b.tokensDelta,
    usedTokens: b.usedTokens,
    referenceId: b.referenceId,
    createdAt: b.createdAt,
    metadata: b.metadata,
  });
}

const sessions = await prisma.session.findMany({
  where: { shop },
  orderBy: { updatedAt: "desc" },
  take: 8,
  select: {
    id: true,
    isOnline: true,
    expires: true,
    updatedAt: true,
    firstName: true,
    lastName: true,
    email: true,
    accountOwner: true,
    locale: true,
    collaborator: true,
  },
});
console.log("\n=== Sessions ===");
console.log(sessions);

const events = await prisma.commonEventLog.findMany({
  where: { shop },
  orderBy: { createdAt: "asc" },
  take: 100,
});
console.log("\n=== CommonEventLog (asc, up to 100) ===");
for (const e of events) {
  console.log({
    createdAt: e.createdAt,
    eventType: e.eventType,
    topic: e.topic,
    appName: e.appName,
    preview: preview(e.payload ?? e.detail ?? e.metadata, 200),
  });
}

const convos = await prisma.conversation.findMany({
  where: { shop },
  orderBy: { updatedAt: "desc" },
  take: 20,
});
console.log("\n=== Conversations ===");
console.log(
  convos.map((c) => ({
    id: c.id,
    title: c.title,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  })),
);

const messages = await prisma.message.findMany({
  where: { conversation: { shop } },
  orderBy: { createdAt: "asc" },
  take: 50,
  select: {
    id: true,
    role: true,
    createdAt: true,
    content: true,
    conversationId: true,
  },
});
console.log("\n=== Messages (asc) ===");
for (const m of messages) {
  console.log({
    createdAt: m.createdAt,
    role: m.role,
    conversationId: m.conversationId,
    preview: preview(m.content, 220),
  });
}

const tasks = await prisma.aITask.findMany({
  where: { shop },
  orderBy: { createdAt: "asc" },
  take: 40,
});
console.log("\n=== AITasks ===");
for (const t of tasks) {
  console.log({
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    id: t.id,
    status: t.status,
    taskType: t.taskType,
  });
}

const batches = await prisma.aITaskBatch.findMany({
  where: { shop },
  orderBy: { createdAt: "desc" },
  take: 20,
});
console.log("\n=== Batches ===");
console.log(
  batches.map((b) => ({
    id: b.id,
    taskType: b.taskType,
    status: b.status,
    createdAt: b.createdAt,
  })),
);

try {
  const toolUsage = await prisma.toolTokenUsageLog.findMany({
    where: { shop },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  console.log("\n=== ToolTokenUsageLog ===");
  for (const u of toolUsage) {
    console.log({
      createdAt: u.createdAt,
      feature: u.feature,
      modelKey: u.modelKey,
      rawTokens: u.rawTokens,
      billedTokens: u.billedTokens,
    });
  }
} catch (e) {
  console.log("\nToolTokenUsageLog skip:", e.message.split("\n")[0]);
}

const files = await prisma.workspaceFile.findMany({
  where: { shop },
  orderBy: { createdAt: "desc" },
  take: 20,
  select: { id: true, name: true, mimeType: true, createdAt: true },
});
console.log("\n=== WorkspaceFiles ===");
console.log(files);

const [orderCount, customerCount, refundCount] = await Promise.all([
  prisma.shopOrder.count({ where: { shop } }),
  prisma.shopCustomer.count({ where: { shop } }),
  prisma.shopRefund.count({ where: { shop } }).catch(() => -1),
]);
console.log("\n=== Mirror counts ===");
console.log({ orderCount, customerCount, refundCount });

try {
  const ads = await prisma.adPlatformCredential.findMany({
    where: { shop },
    select: {
      platform: true,
      externalAccountId: true,
      updatedAt: true,
      createdAt: true,
    },
  });
  console.log("\n=== AdPlatformCredential ===");
  console.log(ads);
} catch (e) {
  console.log("\nAdPlatformCredential skip:", e.message.split("\n")[0]);
}

try {
  const snapshots = await prisma.operationDiagnosisSnapshot.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, createdAt: true, updatedAt: true },
  });
  console.log("\n=== OpSnapshots ===");
  console.log(snapshots);
} catch (e) {
  console.log("\nOpSnapshots skip:", e.message.split("\n")[0]);
}

try {
  const support = await prisma.supportConversation.findMany({
    where: { shop },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });
  console.log("\n=== SupportConversations ===");
  console.log(
    support.map((s) => ({
      id: s.id,
      status: s.status,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
  );
} catch (e) {
  console.log("\nSupportConversations skip:", e.message.split("\n")[0]);
}

const times = [
  account?.createdAt,
  account?.updatedAt,
  sub?.createdAt,
  sub?.updatedAt,
  ...billingLogs.map((b) => b.createdAt),
  ...events.map((e) => e.createdAt),
  ...messages.map((m) => m.createdAt),
  ...tasks.map((t) => t.updatedAt),
  ...sessions.map((s) => s.updatedAt),
].filter(Boolean);
const last = times.length
  ? new Date(Math.max(...times.map((d) => new Date(d).getTime())))
  : null;
const first = times.length
  ? new Date(Math.min(...times.map((d) => new Date(d).getTime())))
  : null;
console.log("\n=== Activity window ===");
console.log({
  first: first?.toISOString(),
  last: last?.toISOString(),
  ageMin: last ? Math.round((Date.now() - last.getTime()) / 60000) : null,
});

await prisma.$disconnect();
