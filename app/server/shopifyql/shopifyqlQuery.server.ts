import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import { formatGraphqlErrors } from "../shopify/parseAdminGraphqlJson.server";
import {
  normalizeReportRows,
  type ReportCellValue,
  type ShopifyqlColumn,
} from "../../lib/shopifyReports";

export const SHOPIFYQL_QUERY = `#graphql
  query ShopifyReportsShopifyql($query: String!) {
    shopifyqlQuery(query: $query) {
      tableData {
        columns {
          name
          dataType
          displayName
        }
        rows
      }
      parseErrors
    }
  }
`;

type ShopifyqlGraphqlPayload = {
  shopifyqlQuery?: {
    parseErrors?: string[] | null;
    tableData?: {
      columns?: Array<{
        name?: string | null;
        dataType?: string | null;
        displayName?: string | null;
      } | null> | null;
      rows?: unknown;
    } | null;
  } | null;
};

export type ShopifyqlCostInfo = {
  requestedQueryCost?: number;
  currentlyAvailable?: number;
  maximumAvailable?: number;
  windowResetAt?: string;
};

export type ShopifyqlQuerySuccess = {
  ok: true;
  accessDenied: false;
  throttled: false;
  retryAfterMs: null;
  columns: ShopifyqlColumn[];
  rows: Array<Record<string, ReportCellValue>>;
  parseErrors: string[];
};

export type ShopifyqlQueryFailure = {
  ok: false;
  accessDenied: boolean;
  throttled: boolean;
  retryAfterMs: number | null;
  error: string;
  columns: ShopifyqlColumn[];
  rows: Array<Record<string, ReportCellValue>>;
  parseErrors: string[];
};

export type ShopifyqlQueryResult = ShopifyqlQuerySuccess | ShopifyqlQueryFailure;

type GraphqlErrorWithCode = {
  message?: string;
  extensions?: { code?: string };
};

type ShopifyqlGraphqlResponse = {
  data?: ShopifyqlGraphqlPayload;
  errors?: GraphqlErrorWithCode[];
  extensions?: { shopifyqlCost?: ShopifyqlCostInfo };
};

export function retryAfterMsFromCost(cost: ShopifyqlCostInfo | undefined, nowMs = Date.now()): number | null {
  const resetAt = cost?.windowResetAt;
  if (!resetAt) return null;
  const resetMs = Date.parse(resetAt);
  if (!Number.isFinite(resetMs)) return null;
  return Math.max(0, resetMs - nowMs);
}

export function isShopifyqlThrottled(
  status: number,
  errors: Array<GraphqlErrorWithCode> | undefined,
  fallbackMessage = "",
): boolean {
  if (status === 429) return true;
  const haystack = [
    ...(errors ?? []).map((error) => `${error.message ?? ""} ${error.extensions?.code ?? ""}`),
    fallbackMessage,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes("throttled") || haystack.includes("rate limited") || haystack.includes("too many requests");
}

export function isShopifyqlAccessDenied(
  errors: Array<GraphqlErrorWithCode> | undefined,
  fallbackMessage = "",
): boolean {
  const haystack = [
    ...(errors ?? []).map((error) => `${error.message ?? ""} ${error.extensions?.code ?? ""}`),
    fallbackMessage,
  ]
    .join(" ")
    .toLowerCase();
  if (!haystack.trim()) return false;
  return (
    haystack.includes("access_denied") ||
    haystack.includes("access denied") ||
    haystack.includes("read_reports")
  );
}

function mapColumns(
  columns: NonNullable<NonNullable<ShopifyqlGraphqlPayload["shopifyqlQuery"]>["tableData"]>["columns"],
): ShopifyqlColumn[] {
  if (!Array.isArray(columns)) return [];
  return columns.flatMap((column) => {
    if (!column?.name) return [];
    return [
      {
        name: column.name,
        dataType: column.dataType ?? "STRING",
        displayName: column.displayName?.trim() || column.name,
      },
    ];
  });
}

export async function executeShopifyqlQuery(
  admin: ShopifyAdminGraphqlClient,
  query: string,
): Promise<ShopifyqlQueryResult> {
  const empty = {
    columns: [] as ShopifyqlColumn[],
    rows: [] as Array<Record<string, ReportCellValue>>,
    parseErrors: [] as string[],
  };

  try {
    const response = await admin.graphql(SHOPIFYQL_QUERY, { variables: { query } });
    const payload = (await response.json()) as ShopifyqlGraphqlResponse;
    const graphqlErrors = payload.errors;
    const cost = payload.extensions?.shopifyqlCost;
    const throttled = isShopifyqlThrottled(response.status, graphqlErrors);
    const retryAfterMs = throttled ? retryAfterMsFromCost(cost) ?? 1_000 : null;

    if (!response.ok || graphqlErrors?.length) {
      const message = formatGraphqlErrors(graphqlErrors) || `HTTP ${response.status}`;
      return {
        ok: false,
        accessDenied: isShopifyqlAccessDenied(graphqlErrors, message),
        throttled,
        retryAfterMs,
        error: message,
        ...empty,
      };
    }

    const result = payload.data?.shopifyqlQuery;
    if (!result) {
      return {
        ok: false,
        accessDenied: false,
        throttled,
        retryAfterMs,
        error: "shopifyqlQuery returned no data",
        ...empty,
      };
    }

    const parseErrors = (result.parseErrors ?? []).filter(Boolean);
    if (parseErrors.length > 0) {
      return {
        ok: false,
        accessDenied: false,
        throttled: false,
        retryAfterMs: null,
        error: parseErrors.join("；"),
        ...empty,
        parseErrors,
      };
    }

    return {
      ok: true,
      accessDenied: false,
      throttled: false,
      retryAfterMs: null,
      columns: mapColumns(result.tableData?.columns),
      rows: normalizeReportRows(result.tableData?.rows),
      parseErrors: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      accessDenied: isShopifyqlAccessDenied(undefined, message),
      throttled: isShopifyqlThrottled(0, undefined, message),
      retryAfterMs: null,
      error: message,
      ...empty,
    };
  }
}
