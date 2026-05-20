export type ShopVisualJobStatus = "pending" | "succeeded" | "failed";

export type ShopVisualJobKind = "image_generation" | "picture_translate";

export type ShopVisualJobDeleteResponse =
  | { success: true; requestId: string }
  | { success: false; errorCode: number; errorMsg: string; requestId?: string };

export type ShopVisualJobHistoryItem = {
  requestId: string;
  kind: ShopVisualJobKind;
  summary: string;
  /** 文生图任务：商户原始画面描述（来自 metadata） */
  description?: string;
  status: ShopVisualJobStatus;
  imageUrl: string | null;
  errorMsg: string | null;
  provider: string | null;
  createdAt: string;
};
