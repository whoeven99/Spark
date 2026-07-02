import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CosmosClient } from "@azure/cosmos";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../../.env.prod");
const envText = readFileSync(envPath, "utf8");
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
);

const endpoint = env.COSMOS_ENDPOINT;
const key = env.COSMOS_KEY;
if (!endpoint || !key) {
  console.error("Missing COSMOS_ENDPOINT / COSMOS_KEY in .env.prod");
  process.exit(1);
}

const client = new CosmosClient({ endpoint, key });

async function getOffer(resource) {
  try {
    const { resource: offer } = await resource.readOffer();
    return {
      id: offer?.id,
      offerType: offer?.offerType,
      offerVersion: offer?.offerVersion,
      content: offer?.content,
    };
  } catch (error) {
    return { error: String(error.code ?? error.message) };
  }
}

const { resources: dbs } = await client.databases.readAll().fetchAll();
const out = { endpoint, account: null, databases: [] };

try {
  const { resource: account } = await client.getDatabaseAccount();
  out.account = {
    id: account.id,
    writableLocations: account.writableLocations?.map((l) => ({
      name: l.name,
      id: l.id,
      failoverPriority: l.failoverPriority,
    })),
    readableLocations: account.readableLocations?.map((l) => l.name),
    consistencyPolicy: account.consistencyPolicy,
    enableMultipleWriteLocations: account.enableMultipleWriteLocations,
    enableAnalyticalStorage: account.enableAnalyticalStorage,
    capacity: account.capacity,
  };
} catch (error) {
  out.account = { error: String(error.message) };
}

for (const db of dbs) {
  const database = client.database(db.id);
  const dbOffer = await getOffer(database);
  const { resources: containers } = await database.containers.readAll().fetchAll();
  const containerInfos = [];

  for (const c of containers) {
    const container = database.container(c.id);
    const offer = await getOffer(container);
    let stats = null;
    try {
      const { resource } = await container.read();
      stats = {
        partitionKey: resource.partitionKey?.paths,
        defaultTtl: resource.defaultTtl,
        indexingMode: resource.indexingPolicy?.indexingMode,
      };
    } catch (error) {
      stats = { error: error.message };
    }
    let docCount = null;
    try {
      const { resources } = await container.items
        .query({ query: "SELECT VALUE COUNT(1) FROM c" })
        .fetchAll();
      docCount = resources[0] ?? 0;
    } catch (error) {
      docCount = { error: error.message };
    }

    containerInfos.push({ id: c.id, throughput: offer, stats, docCount });
  }

  out.databases.push({ id: db.id, throughput: dbOffer, containers: containerInfos });
}

console.log(JSON.stringify(out, null, 2));
