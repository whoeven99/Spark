/**
 * Shopify 官方库存 CSV：按「变体 × 仓库」一行。纯算，不含 IO。
 * SKU 列只用于匹配，不写回 SKU。数量写回列是 On hand (new)。
 */
import { toCsv } from "./csv";

export const INVENTORY_CSV_HEADERS = [
  "Handle",
  "Title",
  "Option1 Name",
  "Option1 Value",
  "Option2 Name",
  "Option2 Value",
  "Option3 Name",
  "Option3 Value",
  "SKU",
  "Location",
  "Incoming",
  "Unavailable",
  "Committed",
  "Available",
  "On hand (current)",
  "On hand (new)",
] as const;

export type InventoryCsvColumn =
  | "handle"
  | "title"
  | "option1Name"
  | "option1Value"
  | "option2Name"
  | "option2Value"
  | "option3Name"
  | "option3Value"
  | "sku"
  | "location"
  | "incoming"
  | "unavailable"
  | "committed"
  | "available"
  | "onHandCurrent"
  | "onHandNew";

const HEADER_ALIASES: Record<string, InventoryCsvColumn> = {
  handle: "handle",
  title: "title",
  "option1 name": "option1Name",
  "option1 value": "option1Value",
  "option2 name": "option2Name",
  "option2 value": "option2Value",
  "option3 name": "option3Name",
  "option3 value": "option3Value",
  sku: "sku",
  "variant sku": "sku",
  location: "location",
  incoming: "incoming",
  unavailable: "unavailable",
  committed: "committed",
  available: "available",
  "on hand": "onHandCurrent",
  "on hand (current)": "onHandCurrent",
  "on hand current": "onHandCurrent",
  "on hand (new)": "onHandNew",
  "on hand new": "onHandNew",
};

export type InventoryCsvRecord = {
  rowNumber: number;
  handle: string;
  title: string;
  option1Name: string;
  option1Value: string;
  option2Name: string;
  option2Value: string;
  option3Name: string;
  option3Value: string;
  sku: string;
  location: string;
  incoming: string;
  unavailable: string;
  committed: string;
  available: string;
  onHandCurrent: string;
  onHandNew: string;
};

export type InventoryCsvExportRow = {
  handle: string;
  title: string;
  option1Name: string;
  option1Value: string;
  option2Name: string;
  option2Value: string;
  option3Name: string;
  option3Value: string;
  sku: string;
  location: string;
  incoming: number;
  unavailable: number;
  committed: number;
  available: number;
  onHand: number;
};

function normalizeHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/[_/]+/g, " ").replace(/\s+/g, " ");
}

export function mapInventoryCsvHeaders(headers: string[]): {
  columns: Partial<Record<InventoryCsvColumn, number>>;
  unknown: string[];
} {
  const columns: Partial<Record<InventoryCsvColumn, number>> = {};
  const unknown: string[] = [];
  headers.forEach((header, index) => {
    const key = HEADER_ALIASES[normalizeHeader(header)];
    if (!key) {
      if (header.trim()) unknown.push(header.trim());
      return;
    }
    if (columns[key] == null) columns[key] = index;
  });
  return { columns, unknown };
}

function cell(row: string[], index: number | undefined): string {
  if (index == null || index < 0) return "";
  return (row[index] ?? "").trim();
}

export function parseInventoryCsvRecords(
  headers: string[],
  rows: string[][],
): InventoryCsvRecord[] {
  const { columns } = mapInventoryCsvHeaders(headers);
  return rows.map((row, index) => ({
    rowNumber: index + 2,
    handle: cell(row, columns.handle),
    title: cell(row, columns.title),
    option1Name: cell(row, columns.option1Name),
    option1Value: cell(row, columns.option1Value),
    option2Name: cell(row, columns.option2Name),
    option2Value: cell(row, columns.option2Value),
    option3Name: cell(row, columns.option3Name),
    option3Value: cell(row, columns.option3Value),
    sku: cell(row, columns.sku),
    location: cell(row, columns.location),
    incoming: cell(row, columns.incoming),
    unavailable: cell(row, columns.unavailable),
    committed: cell(row, columns.committed),
    available: cell(row, columns.available),
    onHandCurrent: cell(row, columns.onHandCurrent),
    onHandNew: cell(row, columns.onHandNew),
  }));
}

export function parseNonNegativeInt(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, "");
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

export function buildInventoryCsv(rows: InventoryCsvExportRow[]): string {
  return toCsv(
    INVENTORY_CSV_HEADERS,
    rows.map((row) => [
      row.handle,
      row.title,
      row.option1Name,
      row.option1Value,
      row.option2Name,
      row.option2Value,
      row.option3Name,
      row.option3Value,
      row.sku,
      row.location,
      String(row.incoming),
      String(row.unavailable),
      String(row.committed),
      String(row.available),
      String(row.onHand),
      "",
    ]),
  );
}

export function optionKey(option1: string, option2: string, option3: string): string {
  return [option1, option2, option3].map((value) => value.trim().toLowerCase()).join("\u0001");
}

export const INVENTORY_EXPORT_PREVIEW_LIMIT = 100;

export type InventoryExportPreviewRow = {
  key: string;
  productTitle: string;
  handle: string;
  variantTitle: string;
  sku: string;
  location: string;
  available: number;
  onHand: number;
};

function optionLabel(row: Pick<InventoryCsvExportRow, "option1Value" | "option2Value" | "option3Value">): string {
  return [row.option1Value, row.option2Value, row.option3Value]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" / ");
}

export function buildInventoryExportPreviewRows(
  rows: InventoryCsvExportRow[],
  limit = INVENTORY_EXPORT_PREVIEW_LIMIT,
): InventoryExportPreviewRow[] {
  return rows.slice(0, limit).map((row, index) => ({
    key: `${row.handle}:${row.sku}:${row.location}:${index}`,
    productTitle: row.title,
    handle: row.handle,
    variantTitle: optionLabel(row),
    sku: row.sku,
    location: row.location,
    available: row.available,
    onHand: row.onHand,
  }));
}

export function coerceInventoryExportPreviewRows(raw: unknown): InventoryExportPreviewRow[] {
  if (!Array.isArray(raw)) return [];
  const out: InventoryExportPreviewRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const key = typeof record.key === "string" ? record.key.trim() : "";
    const handle = typeof record.handle === "string" ? record.handle : "";
    const location = typeof record.location === "string" ? record.location : "";
    if (!key && !handle && !location) continue;
    out.push({
      key: key || `${handle}:${location}:${out.length}`,
      productTitle: typeof record.productTitle === "string" ? record.productTitle : "",
      handle,
      variantTitle: typeof record.variantTitle === "string" ? record.variantTitle : "",
      sku: typeof record.sku === "string" ? record.sku : "",
      location,
      available: Number(record.available) || 0,
      onHand: Number(record.onHand) || 0,
    });
  }
  return out;
}
