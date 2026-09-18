import { appendEmbeddedSearchToPath } from "./embeddedLocationSearch";

/** 文件路由 `api.ads-edit.list.ts` 对应 `/api/ads-edit/list`，不能写成 `/api/ads-edit.list`。 */
export const ADS_EDIT_LIST_PATH = "/api/ads-edit/list";

export function buildAdsEditListUrl(
  locationSearch: string,
  extra: Record<string, string>,
): string {
  const params = new URLSearchParams(extra);
  return appendEmbeddedSearchToPath(
    `${ADS_EDIT_LIST_PATH}?${params.toString()}`,
    locationSearch,
  );
}
