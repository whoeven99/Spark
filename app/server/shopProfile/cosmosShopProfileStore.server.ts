import { CosmosClient, type Container } from "@azure/cosmos";
import type { ShopProfileDoc } from "./types.server";

const DEFAULT_DATABASE_ID = "spark_ops";
const DEFAULT_CONTAINER_ID = "shop_profiles";

let containerPromise: Promise<Container> | null = null;

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
}

export function isShopProfileCosmosConfigured(): boolean {
  return Boolean(
    process.env.COSMOS_ENDPOINT?.trim() && process.env.COSMOS_KEY?.trim(),
  );
}

async function getShopProfilesContainer(): Promise<Container> {
  if (containerPromise) return containerPromise;
  containerPromise = (async () => {
    const endpoint = getRequiredEnv("COSMOS_ENDPOINT");
    const key = getRequiredEnv("COSMOS_KEY");
    const databaseId =
      process.env.COSMOS_OPS_DATABASE_ID?.trim() || DEFAULT_DATABASE_ID;
    const containerId =
      process.env.COSMOS_SHOP_PROFILES_CONTAINER?.trim() ||
      DEFAULT_CONTAINER_ID;
    const client = new CosmosClient({ endpoint, key });
    const { database } = await client.databases.createIfNotExists({
      id: databaseId,
    });
    const { container } = await database.containers.createIfNotExists({
      id: containerId,
      partitionKey: { paths: ["/shop"] },
    });
    return container;
  })();
  return containerPromise;
}

export async function getShopProfileDoc(
  shop: string,
): Promise<ShopProfileDoc | null> {
  const shopTrim = shop.trim();
  if (!shopTrim || !isShopProfileCosmosConfigured()) return null;
  try {
    const container = await getShopProfilesContainer();
    const { resource } = await container
      .item("profile", shopTrim)
      .read<ShopProfileDoc>();
    return resource ?? null;
  } catch (error: unknown) {
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code: unknown }).code === "number"
        ? (error as { code: number }).code
        : undefined;
    if (code === 404) return null;
    throw error;
  }
}

export async function upsertShopProfileDoc(doc: ShopProfileDoc): Promise<void> {
  const shop = doc.shop.trim();
  if (!shop) return;
  const container = await getShopProfilesContainer();
  await container.items.upsert({ ...doc, id: "profile", shop });
}
