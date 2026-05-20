export type ShopVisualJobStatus = "pending" | "succeeded" | "failed";

export type ShopVisualJobKind = "image_generation" | "picture_translate";

export type ShopVisualJobHistoryItem = {
  requestId: string;
  kind: ShopVisualJobKind;
  summary: string;
  status: ShopVisualJobStatus;
  imageUrl: string | null;
  errorMsg: string | null;
  provider: string | null;
  createdAt: string;
};
