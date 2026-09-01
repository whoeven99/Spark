import { getTsfDb } from "../tsfDb.js";
import { resolveShopAccessToken } from "../shopSession.js";
import { listOpsEmailAudience, type AudienceFilters } from "./audience.js";
import { maskEmail } from "./maskEmail.js";

const SHOPIFY_API_VERSION = "2024-10";
const MAX_BACKFILL = 80;
const GAP_MS = 250;

const SHOP_EMAIL_QUERY = `#graphql
  query OpsEmailShopEmail {
    shop {
      email
      contactEmail
    }
  }
`;

export type BackfillEmailResult = {
  shop: string;
  status: "updated" | "failed";
  emailMasked: string | null;
  error?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickEmail(shop: {
  email?: string | null;
  contactEmail?: string | null;
}): string {
  return shop.contactEmail?.trim() || shop.email?.trim() || "";
}

async function fetchShopEmail(shop: string, accessToken: string): Promise<string> {
  const response = await fetch(
    `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: SHOP_EMAIL_QUERY }),
    },
  );
  if (!response.ok) {
    throw new Error(`Shopify HTTP ${response.status}`);
  }
  const json = (await response.json()) as {
    data?: { shop?: { email?: string | null; contactEmail?: string | null } };
    errors?: { message: string }[];
  };
  if (json.errors?.length) {
    throw new Error(json.errors.map((item) => item.message).join("; "));
  }
  const email = pickEmail(json.data?.shop ?? {});
  if (!email.includes("@")) {
    throw new Error("Shopify 未返回有效邮箱");
  }
  return email;
}

async function writeSessionEmail(
  shop: string,
  email: string | null,
  onlyEmpty: boolean,
): Promise<number> {
  const db = getTsfDb();
  const sql = onlyEmpty
    ? `UPDATE Session
       SET email = ?
       WHERE lower(shop) = ?
         AND (email IS NULL OR trim(email) = '')`
    : `UPDATE Session SET email = ? WHERE lower(shop) = ?`;
  const result = await db.execute({
    sql,
    args: [email, shop],
  });
  return Number(result.rowsAffected ?? 0);
}

function parseManualEmail(raw: string): string | null {
  const email = raw.trim();
  if (!email) return null;
  if (!email.includes("@") || /\s/.test(email)) {
    throw new Error("邮箱格式无效");
  }
  return email;
}

export async function setShopSessionEmail(
  shop: string,
  rawEmail: string,
): Promise<{
  shop: string;
  email: string | null;
  emailMasked: string | null;
  persisted: boolean;
}> {
  const email = parseManualEmail(rawEmail);
  const affected = await writeSessionEmail(shop, email, false);
  return {
    shop,
    email,
    emailMasked: maskEmail(email),
    persisted: affected > 0,
  };
}

export async function backfillMissingShopEmails(filters: AudienceFilters): Promise<{
  scanned: number;
  updated: number;
  failed: number;
  remaining: number;
  results: BackfillEmailResult[];
}> {
  const audience = await listOpsEmailAudience({
    ...filters,
    hasEmailOnly: false,
  });
  const missing = audience.shops.filter((row) => !row.email?.trim());
  const batch = missing.slice(0, MAX_BACKFILL);
  const results: BackfillEmailResult[] = [];

  for (const [index, row] of batch.entries()) {
    if (index > 0) await sleep(GAP_MS);
    try {
      const session = await resolveShopAccessToken(row.shop);
      const email = await fetchShopEmail(session.shop, session.accessToken);
      const affected = await writeSessionEmail(row.shop, email, true);
      if (affected <= 0) {
        results.push({
          shop: row.shop,
          status: "failed",
          emailMasked: maskEmail(email),
          error: "Session 无空邮箱行可写",
        });
        continue;
      }
      results.push({
        shop: row.shop,
        status: "updated",
        emailMasked: maskEmail(email),
      });
    } catch (error) {
      results.push({
        shop: row.shop,
        status: "failed",
        emailMasked: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    scanned: missing.length,
    updated: results.filter((item) => item.status === "updated").length,
    failed: results.filter((item) => item.status === "failed").length,
    remaining: Math.max(0, missing.length - batch.length),
    results,
  };
}
