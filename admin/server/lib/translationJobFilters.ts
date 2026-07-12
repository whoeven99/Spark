import type { SqlParameter } from "@azure/cosmos";

export type TranslationJobFilterInput = {
  shop?: string;
  status?: string;
  /** 任务来源（如 TsFrontend-Auto） */
  taskSource?: string;
  langFrom?: string;
  langTo?: string;
  createdFrom?: string;
  createdTo?: string;
};

export function buildTranslationJobFilters(
  input: TranslationJobFilterInput,
): { conditions: string[]; params: SqlParameter[] } {
  const conditions: string[] = [];
  const params: SqlParameter[] = [];

  const shop = input.shop?.trim();
  if (shop) {
    conditions.push("c.shopName = @shop");
    params.push({ name: "@shop", value: shop });
  }

  const status = input.status?.trim();
  if (status) {
    conditions.push("c.status = @status");
    params.push({ name: "@status", value: status });
  }

  const taskSource = input.taskSource?.trim();
  if (taskSource) {
    conditions.push("c.taskSource = @taskSource");
    params.push({ name: "@taskSource", value: taskSource });
  }

  const langFrom = input.langFrom?.trim();
  if (langFrom) {
    conditions.push("c.source = @langFrom");
    params.push({ name: "@langFrom", value: langFrom });
  }

  const langTo = input.langTo?.trim();
  if (langTo) {
    conditions.push("c.target = @langTo");
    params.push({ name: "@langTo", value: langTo });
  }

  const createdFrom = input.createdFrom?.trim();
  if (createdFrom) {
    conditions.push("c.createdAt >= @createdFrom");
    params.push({ name: "@createdFrom", value: createdFrom });
  }

  const createdTo = input.createdTo?.trim();
  if (createdTo) {
    conditions.push("c.createdAt <= @createdTo");
    params.push({ name: "@createdTo", value: createdTo });
  }

  return { conditions, params };
}

export function translationJobWhereClause(conditions: string[]): string {
  return conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
}

export function parseTranslationJobFiltersFromQuery(
  query: Record<string, string | undefined>,
): TranslationJobFilterInput {
  return {
    shop: query.shop,
    status: query.status,
    taskSource: query.source,
    langFrom: query.langFrom,
    langTo: query.langTo,
    createdFrom: query.createdFrom,
    createdTo: query.createdTo,
  };
}
