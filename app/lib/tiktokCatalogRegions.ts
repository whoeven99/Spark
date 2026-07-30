/** TikTok Catalog API 支持通过 Spark 自动创建的目标市场（ISO2）。不含 HK/TW 等 TikTok 拒绝创建的地区。 */
export const TIKTOK_CATALOG_AUTO_CREATE_REGION_CODES = [
  "US",
  "CA",
  "GB",
  "AU",
  "NZ",
  "DE",
  "FR",
  "IT",
  "ES",
  "NL",
  "BE",
  "AT",
  "CH",
  "SE",
  "NO",
  "DK",
  "FI",
  "PL",
  "CZ",
  "PT",
  "IE",
  "SG",
  "MY",
  "TH",
  "PH",
  "ID",
  "VN",
  "JP",
  "KR",
  "MX",
  "BR",
  "SA",
  "AE",
] as const;

export type TiktokCatalogAutoCreateRegionCode =
  (typeof TIKTOK_CATALOG_AUTO_CREATE_REGION_CODES)[number];

export function isTiktokCatalogAutoCreateRegion(
  regionCode: string,
): regionCode is TiktokCatalogAutoCreateRegionCode {
  return (TIKTOK_CATALOG_AUTO_CREATE_REGION_CODES as readonly string[]).includes(
    regionCode.trim().toUpperCase(),
  );
}
