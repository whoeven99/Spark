import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaLibSQL } from "@prisma/adapter-libsql/web";
import { loadStackedEnv, resolveTurso } from "./lib/loadEnv.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadStackedEnv({ root, overlay: ".env.prod" });
const turso = resolveTurso(process.env);
const require = createRequire(import.meta.url);
const { PrismaClient } = require("../app/generated/prisma/index.js");
const prisma = new PrismaClient({
  adapter: new PrismaLibSQL({ url: turso.url, authToken: turso.authToken }),
});

const shop = "ciwishop.myshopify.com";
const [logs, packs] = await Promise.all([
  prisma.billingLog.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      eventType: true,
      planKey: true,
      tokensDelta: true,
      usedTokens: true,
      createdAt: true,
    },
  }),
  prisma.planCatalog.findMany({
    where: { kind: { in: ["ONE_TIME_PACK", "INTERNAL_TRIAL"] } },
    orderBy: { sortOrder: "asc" },
    select: {
      planKey: true,
      kind: true,
      displayName: true,
      tokens: true,
      enabled: true,
    },
  }),
]);

console.log(JSON.stringify({ shop, logs, packs }, null, 2));
await prisma.$disconnect();
