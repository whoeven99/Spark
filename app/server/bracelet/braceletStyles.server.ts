import type { BraceletStyleDefinition, BraceletStyleId } from "./types";

export const BRACELET_STYLES: Record<BraceletStyleId, BraceletStyleDefinition> = {
  classic: {
    id: "classic",
    label: "经典款",
    optionValue: "Classic",
  },
  beaded: {
    id: "beaded",
    label: "串珠款",
    optionValue: "Beaded",
  },
};

export function isBraceletStyleId(value: unknown): value is BraceletStyleId {
  return typeof value === "string" && value in BRACELET_STYLES;
}

export function getBraceletStyle(style: BraceletStyleId): BraceletStyleDefinition {
  return BRACELET_STYLES[style];
}
