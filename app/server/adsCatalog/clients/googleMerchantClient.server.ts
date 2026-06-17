import type { GoogleMerchantProduct } from "../mappers/shopifyToGoogle";
import { formatOutboundNetworkError } from "../../common/outboundError.server";

const GMC_BASE = "https://shoppingcontent.googleapis.com/content/v2.1";
const CUSTOM_BATCH_CHUNK = 100;

export interface GoogleBatchResult {
  totalRequested: number;
  totalProcessed: number;
  errors: Array<{ id: string; reason: string }>;
}

interface CustomBatchEntry {
  batchId: number;
  merchantId: string;
  method: "insert" | "delete";
  product?: GoogleMerchantProduct;
  productId?: string;
}

interface CustomBatchResponseEntry {
  batchId: number;
  product?: { offerId?: string };
  errors?: { errors?: Array<{ message?: string }> };
}

/**
 * Push products to Google Merchant Center via Content API custombatch.
 *
 * Endpoint:
 *   POST https://shoppingcontent.googleapis.com/content/v2.1/products/batch
 *   Authorization: Bearer {accessToken}
 *   body: { entries: [{ batchId, merchantId, method, product }, ...] }
 */
export async function upsertGoogleMerchantProducts(params: {
  accessToken: string;
  merchantId: string;
  products: GoogleMerchantProduct[];
}): Promise<GoogleBatchResult> {
  const result: GoogleBatchResult = {
    totalRequested: params.products.length,
    totalProcessed: 0,
    errors: [],
  };

  for (let offset = 0; offset < params.products.length; offset += CUSTOM_BATCH_CHUNK) {
    const chunk = params.products.slice(offset, offset + CUSTOM_BATCH_CHUNK);
    const entries: CustomBatchEntry[] = chunk.map((product, index) => ({
      batchId: offset + index,
      merchantId: params.merchantId,
      method: "insert",
      product,
    }));

    let response: Response;
    try {
      response = await fetch(`${GMC_BASE}/products/batch`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ entries }),
      });
    } catch (e) {
      const reason = formatOutboundNetworkError(e);
      for (const product of chunk) {
        result.errors.push({
          id: product.offerId,
          reason: `network error: ${reason}`,
        });
      }
      continue;
    }

    const text = await response.text();
    let payload: { entries?: CustomBatchResponseEntry[]; error?: { message?: string } } = {};
    try {
      payload = text ? (JSON.parse(text) as typeof payload) : {};
    } catch {
      payload = {};
    }

    if (!response.ok) {
      const reason =
        payload.error?.message || `HTTP ${response.status} ${text.slice(0, 200)}`;
      for (const product of chunk) {
        result.errors.push({ id: product.offerId, reason });
      }
      continue;
    }

    const responseEntries = payload.entries ?? [];
    for (const entry of responseEntries) {
      const product = chunk[entry.batchId - offset];
      if (!product) continue;
      const apiErrors = entry.errors?.errors;
      if (apiErrors && apiErrors.length > 0) {
        result.errors.push({
          id: product.offerId,
          reason: apiErrors.map((e) => e.message || "unknown error").join("; "),
        });
      } else {
        result.totalProcessed += 1;
      }
    }
  }

  return result;
}

/**
 * Verify the access token is valid against the merchant account.
 */
export async function verifyGoogleMerchantCredential(params: {
  accessToken: string;
  merchantId: string;
}): Promise<{ ok: true; name?: string } | { ok: false; reason: string }> {
  try {
    const response = await fetch(
      `${GMC_BASE}/${encodeURIComponent(params.merchantId)}/accounts/${encodeURIComponent(
        params.merchantId,
      )}`,
      { headers: { Authorization: `Bearer ${params.accessToken}` } },
    );
    const json = (await response.json().catch(() => ({}))) as {
      name?: string;
      error?: { message?: string };
    };
    if (!response.ok) {
      return { ok: false, reason: json.error?.message || `HTTP ${response.status}` };
    }
    return { ok: true, name: json.name };
  } catch (e) {
    return { ok: false, reason: formatOutboundNetworkError(e) };
  }
}

/**
 * Refresh an OAuth2 access token using the stored refresh token.
 * Returns the new access token (and its TTL in seconds).
 */
export async function refreshGoogleAccessToken(params: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<{ accessToken: string; expiresIn: number } | null> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: params.clientId,
        client_secret: params.clientSecret,
        refresh_token: params.refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });
    if (!response.ok) return null;
    const json = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!json.access_token) return null;
    return {
      accessToken: json.access_token,
      expiresIn: json.expires_in ?? 3600,
    };
  } catch {
    return null;
  }
}
