import type { ShopVisualJobDeleteResponse } from "./shopVisualJobTypes";

export async function postDeleteShopVisualJob(params: {
  locationSearch: string;
  requestId: string;
}): Promise<ShopVisualJobDeleteResponse> {
  const res = await fetch(`/api/shop-visual-job${params.locationSearch}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: params.requestId }),
  });
  return (await res.json()) as ShopVisualJobDeleteResponse;
}
