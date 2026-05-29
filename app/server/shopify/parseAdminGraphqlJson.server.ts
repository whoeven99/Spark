type GraphqlError = { message?: string };

export type AdminGraphqlJson<T> = {
  data?: T;
  errors?: GraphqlError[];
};

/** 解析 admin.graphql 返回的 Response（HTTP 200 时仍可能有 errors）。 */
export async function parseAdminGraphqlJson<T>(
  response: Response,
): Promise<AdminGraphqlJson<T>> {
  return (await response.json()) as AdminGraphqlJson<T>;
}

export function formatGraphqlErrors(errors: GraphqlError[] | undefined): string {
  if (!errors?.length) return "";
  return errors.map((e) => e.message ?? "unknown").join("；");
}
