import type {
  SHOP_VISUAL_JOB_KIND_IMAGE_GENERATION,
  SHOP_VISUAL_JOB_KIND_PICTURE_TRANSLATE,
} from "./kinds.server";

export type ShopVisualJobKind =
  | typeof SHOP_VISUAL_JOB_KIND_IMAGE_GENERATION
  | typeof SHOP_VISUAL_JOB_KIND_PICTURE_TRANSLATE;

export type { ShopVisualJobHistoryItem, ShopVisualJobStatus } from "../../lib/shopVisualJobTypes";
export {
  SHOP_VISUAL_JOB_KIND_IMAGE_GENERATION,
  SHOP_VISUAL_JOB_KIND_PICTURE_TRANSLATE,
} from "./kinds.server";
