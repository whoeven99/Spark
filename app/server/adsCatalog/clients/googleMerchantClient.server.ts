import type { GoogleMerchantProduct } from "../mappers/shopifyToGoogle";
import { formatOutboundErrorLog, formatOutboundNetworkError } from "../../common/outboundError.server";

const MERCHANT_API_BASE = "https://merchantapi.googleapis.com";
const PRODUCT_INSERT_CONCURRENCY = 10;

export interface GoogleBatchResult {
  totalRequested: number;
  totalProcessed: number;
  errors: Array<{ id: string; reason: string }>;
}

export interface GoogleMerchantAccount {
  name?: string;
  accountId?: string;
  accountName?: string;
}

export interface GoogleMerchantDataSource {
  name?: string;
  displayName?: string;
  input?: string;
  primaryProductDataSource?: {
    channel?: string;
    contentLanguage?: string;
    feedLabel?: string;
  };
}

export interface GoogleMerchantProductResource {
  name?: string;
  offerId?: string;
  contentLanguage?: string;
  feedLabel?: string;
  productAttributes?: { title?: string };
  productStatus?: {
    destinationStatuses?: Array<{
      reportingContext?: string;
      approvedCountries?: string[];
      pendingCountries?: string[];
      disapprovedCountries?: string[];
    }>;
    itemLevelIssues?: Array<{
      code?: string;
      severity?: string;
      description?: string;
      detail?: string;
    }>;
  };
}

export interface GoogleMerchantAccountIssue {
  name?: string;
  title?: string;
  severity?: string;
  detail?: string;
}

export interface GoogleMerchantProductInput {
  offerId: string;
  contentLanguage: string;
  feedLabel: string;
  productAttributes: Record<string, unknown>;
}

function parseMerchantApiError(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const error = (payload as { error?: unknown }).error;
    if (error && typeof error === "object") {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) return message;
    }
  }
  return `Merchant API HTTP ${status}`;
}

async function merchantApiRequest<T>(params: {
  accessToken: string;
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${MERCHANT_API_BASE}${params.path}`, {
      method: params.method ?? "GET",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        ...(params.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(params.body === undefined ? {} : { body: JSON.stringify(params.body) }),
    });
  } catch (error) {
    throw new Error(formatOutboundNetworkError(error));
  }
  const payload = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) throw new Error(parseMerchantApiError(payload, response.status));
  return payload;
}

export async function listGoogleMerchantAccounts(
  accessToken: string,
): Promise<GoogleMerchantAccount[]> {
  const accounts: GoogleMerchantAccount[] = [];
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({ pageSize: "500" });
    if (pageToken) query.set("pageToken", pageToken);
    const payload = await merchantApiRequest<{
      accounts?: GoogleMerchantAccount[];
      nextPageToken?: string;
    }>({
      accessToken,
      path: `/accounts/v1/accounts?${query.toString()}`,
    });
    accounts.push(...(payload.accounts ?? []));
    pageToken = payload.nextPageToken;
  } while (pageToken);
  return accounts;
}

export async function getGoogleMerchantAccount(params: {
  accessToken: string;
  merchantId: string;
}): Promise<GoogleMerchantAccount> {
  return merchantApiRequest({
    accessToken: params.accessToken,
    path: `/accounts/v1/accounts/${encodeURIComponent(params.merchantId)}`,
  });
}

export async function listGoogleMerchantDataSources(params: {
  accessToken: string;
  merchantId: string;
}): Promise<GoogleMerchantDataSource[]> {
  const dataSources: GoogleMerchantDataSource[] = [];
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({ pageSize: "1000" });
    if (pageToken) query.set("pageToken", pageToken);
    const payload = await merchantApiRequest<{
      dataSources?: GoogleMerchantDataSource[];
      nextPageToken?: string;
    }>({
      accessToken: params.accessToken,
      path: `/datasources/v1/accounts/${encodeURIComponent(params.merchantId)}/dataSources?${query.toString()}`,
    });
    dataSources.push(...(payload.dataSources ?? []));
    pageToken = payload.nextPageToken;
  } while (pageToken);
  return dataSources;
}

function isMatchingApiPrimaryDataSource(
  source: GoogleMerchantDataSource,
  contentLanguage: string,
  feedLabel: string,
): boolean {
  const primary = source.primaryProductDataSource;
  return (
    (source.input === undefined || source.input === "API") &&
    primary?.channel === "ONLINE" &&
    primary.contentLanguage?.toLowerCase() === contentLanguage.toLowerCase() &&
    primary.feedLabel?.toUpperCase() === feedLabel.toUpperCase()
  );
}

export async function ensureGoogleMerchantDataSource(params: {
  accessToken: string;
  merchantId: string;
  contentLanguage: string;
  feedLabel: string;
  preferredName?: string;
}): Promise<GoogleMerchantDataSource> {
  const dataSources = await listGoogleMerchantDataSources(params);
  const preferred = dataSources.find((source) => source.name === params.preferredName);
  const candidates = [preferred, ...dataSources].filter(
    (source): source is GoogleMerchantDataSource => source !== undefined,
  );
  const reusable = candidates.find((source) =>
    isMatchingApiPrimaryDataSource(source, params.contentLanguage, params.feedLabel),
  );
  if (reusable?.name) return reusable;

  return merchantApiRequest({
    accessToken: params.accessToken,
    path: `/datasources/v1/accounts/${encodeURIComponent(params.merchantId)}/dataSources`,
    method: "POST",
    body: {
      displayName: `Spark API ${params.feedLabel.toUpperCase()}-${params.contentLanguage.toLowerCase()}`,
      primaryProductDataSource: {
        channel: "ONLINE",
        contentLanguage: params.contentLanguage.toLowerCase(),
        feedLabel: params.feedLabel.toUpperCase(),
      },
    },
  });
}

function priceToMicros(price: { value: string; currency: string }): {
  amountMicros: string;
  currencyCode: string;
} {
  const amount = Number(price.value);
  if (!Number.isFinite(amount)) throw new Error(`invalid price: ${price.value}`);
  return {
    amountMicros: String(Math.round(amount * 1_000_000)),
    currencyCode: price.currency.toUpperCase(),
  };
}

export function toGoogleMerchantProductInput(
  product: GoogleMerchantProduct,
  feedLabel: string,
): GoogleMerchantProductInput {
  return {
    offerId: product.offerId,
    contentLanguage: product.contentLanguage.toLowerCase(),
    feedLabel: feedLabel.toUpperCase(),
    productAttributes: {
      title: product.title,
      description: product.description,
      link: product.link,
      imageLink: product.imageLink,
      availability: product.availability.replaceAll(" ", "_").toUpperCase(),
      condition: product.condition.toUpperCase(),
      price: priceToMicros(product.price),
      ...(product.salePrice ? { salePrice: priceToMicros(product.salePrice) } : {}),
      brand: product.brand,
      ...(product.gtin ? { gtins: [product.gtin] } : {}),
      ...(product.mpn ? { mpn: product.mpn } : {}),
      ...(product.identifierExists === undefined
        ? {}
        : { identifierExists: product.identifierExists }),
      ...(product.googleProductCategory
        ? { googleProductCategory: product.googleProductCategory }
        : {}),
      ...(product.productTypes ? { productTypes: product.productTypes } : {}),
      ...(product.additionalImageLinks
        ? { additionalImageLinks: product.additionalImageLinks }
        : {}),
      ...(product.itemGroupId ? { itemGroupId: product.itemGroupId } : {}),
      ...(product.color ? { color: product.color } : {}),
      ...(product.sizes ? { sizes: product.sizes } : {}),
      ...(product.gender ? { gender: product.gender.toUpperCase() } : {}),
      ...(product.ageGroup
        ? { ageGroup: product.ageGroup.replaceAll(" ", "_").toUpperCase() }
        : {}),
    },
  };
}

async function runWithConcurrency<T>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (cursor < values.length) {
        const value = values[cursor];
        cursor += 1;
        await worker(value);
      }
    },
  );
  await Promise.all(runners);
}

export async function upsertGoogleMerchantProducts(params: {
  accessToken: string;
  merchantId: string;
  dataSourceName: string;
  feedLabel: string;
  products: GoogleMerchantProduct[];
}): Promise<GoogleBatchResult> {
  const result: GoogleBatchResult = {
    totalRequested: params.products.length,
    totalProcessed: 0,
    errors: [],
  };
  const query = new URLSearchParams({ dataSource: params.dataSourceName });
  await runWithConcurrency(params.products, PRODUCT_INSERT_CONCURRENCY, async (product) => {
    try {
      await merchantApiRequest({
        accessToken: params.accessToken,
        path: `/products/v1/accounts/${encodeURIComponent(params.merchantId)}/productInputs:insert?${query.toString()}`,
        method: "POST",
        body: toGoogleMerchantProductInput(product, params.feedLabel),
      });
      result.totalProcessed += 1;
    } catch (error) {
      result.errors.push({
        id: product.offerId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  });
  return result;
}

export async function listGoogleMerchantProducts(params: {
  accessToken: string;
  merchantId: string;
  limit?: number;
}): Promise<GoogleMerchantProductResource[]> {
  const products: GoogleMerchantProductResource[] = [];
  const limit = Math.max(1, Math.min(params.limit ?? 250, 1000));
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({ pageSize: String(limit) });
    if (pageToken) query.set("pageToken", pageToken);
    const payload = await merchantApiRequest<{
      products?: GoogleMerchantProductResource[];
      nextPageToken?: string;
    }>({
      accessToken: params.accessToken,
      path: `/products/v1/accounts/${encodeURIComponent(params.merchantId)}/products?${query.toString()}`,
    });
    products.push(...(payload.products ?? []));
    pageToken = payload.nextPageToken;
  } while (pageToken && products.length < limit);
  return products.slice(0, limit);
}

export function normalizeMerchantProductId(resourceId: string): string {
  return resourceId.replace(/^online~/, "");
}

export async function getGoogleMerchantProduct(params: {
  accessToken: string;
  merchantId: string;
  resourceId: string;
}): Promise<GoogleMerchantProductResource> {
  const productId = normalizeMerchantProductId(params.resourceId);
  const encodedProductId = Buffer.from(productId).toString("base64url");
  return merchantApiRequest({
    accessToken: params.accessToken,
    path: `/products/v1/accounts/${encodeURIComponent(params.merchantId)}/products/${encodedProductId}`,
  });
}

export async function listGoogleMerchantAccountIssues(params: {
  accessToken: string;
  merchantId: string;
}): Promise<GoogleMerchantAccountIssue[]> {
  const issues: GoogleMerchantAccountIssue[] = [];
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({ pageSize: "100" });
    if (pageToken) query.set("pageToken", pageToken);
    const payload = await merchantApiRequest<{
      accountIssues?: GoogleMerchantAccountIssue[];
      nextPageToken?: string;
    }>({
      accessToken: params.accessToken,
      path: `/accounts/v1/accounts/${encodeURIComponent(params.merchantId)}/issues?${query.toString()}`,
    });
    issues.push(...(payload.accountIssues ?? []));
    pageToken = payload.nextPageToken;
  } while (pageToken);
  return issues;
}

/**
 * Verify the access token is valid against the Merchant API v1 account.
 */
export async function verifyGoogleMerchantCredential(params: {
  accessToken: string;
  merchantId: string;
}): Promise<{ ok: true; name?: string } | { ok: false; reason: string }> {
  try {
    const account = await getGoogleMerchantAccount(params);
    return { ok: true, name: account.accountName };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
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
  } catch (e) {
    console.warn(
      `[AdsCatalog][GoogleOAuth] refresh_access_token failed ${formatOutboundErrorLog(e)}`,
    );
    return null;
  }
}
