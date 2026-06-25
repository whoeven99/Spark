export const BRACELET_STYLE_IDS = ["classic", "beaded"] as const;

export type BraceletStyleId = (typeof BRACELET_STYLE_IDS)[number];

export interface BraceletStyleDefinition {
  id: BraceletStyleId;
  label: string;
  /** Shopify variant option value, e.g. product option "Style" */
  optionValue: string;
}

export interface PrepareBraceletInput {
  style: BraceletStyleId;
  engraving: string;
  previewDataUrl: string;
}

export interface PrepareBraceletResult {
  variantId: number;
  properties: Record<string, string>;
}

export interface PrepareBraceletError {
  ok: false;
  error: string;
  status: number;
}

export type PrepareBraceletResponse =
  | ({ ok: true } & PrepareBraceletResult)
  | PrepareBraceletError;
