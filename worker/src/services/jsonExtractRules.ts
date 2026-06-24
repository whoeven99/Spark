/**
 * Rule-based JSON text extraction — aligned with Java JsonTranslateStrategyService.
 * Replaces heuristic DFS for metafield JSON so only configured paths/fields translate.
 */

import { loadMetafieldJsonTranslateRule, PROD_METAFIELD_JSON_TRANSLATE_RULE } from "./metafieldJsonConfig.js";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export type JsonExtractRule = {
  mode: "typeFieldMatch" | "path";
  typeField?: string;
  typeValue?: string;
  translateField?: string;
  path?: string;
};

export type JsonTextSlot = {
  parent: Record<string, JsonValue>;
  fieldName: string;
  text: string;
  /** body_html and similar leaves should run through the HTML translator. */
  isHtml: boolean;
};

const RULE_MODE_TYPE_MATCH = "typeFieldMatch";
const RULE_MODE_PATH = "path";

const HTML_FIELD_NAMES = new Set(["body_html", "content_html", "html"]);

function isHtmlFieldName(fieldName: string): boolean {
  return HTML_FIELD_NAMES.has(fieldName) || fieldName.endsWith("_html");
}

/** Prod defaults synced from Spring Redis bogda:config (see docs/metafield-json-translate-rule.prod.json). */
export function buildDefaultJsonExtractRules(): JsonExtractRule[] {
  return PROD_METAFIELD_JSON_TRANSLATE_RULE.jsonExtractRules ?? [];
}

export function loadJsonExtractRules(): JsonExtractRule[] {
  const rules = loadMetafieldJsonTranslateRule().jsonExtractRules;
  if (Array.isArray(rules) && rules.length > 0) return rules;
  return buildDefaultJsonExtractRules();
}

function buildDedupKey(parent: object, fieldName: string): string {
  return `${Object.prototype.toString.call(parent)}:${fieldName}:${String((parent as Record<string, unknown>)[fieldName])}`;
}

function pushTextSlot(
  slots: JsonTextSlot[],
  dedup: Set<string>,
  parent: Record<string, JsonValue>,
  fieldName: string,
  textValue: string,
): void {
  const trimmed = textValue.trim();
  if (!trimmed) return;
  const dedupKey = buildDedupKey(parent, fieldName);
  if (dedup.has(dedupKey)) return;
  dedup.add(dedupKey);
  slots.push({
    parent,
    fieldName,
    text: textValue,
    isHtml: isHtmlFieldName(fieldName),
  });
}

function collectByTypeMatchRule(
  rootNode: JsonValue,
  rule: JsonExtractRule,
  slots: JsonTextSlot[],
  dedup: Set<string>,
): void {
  if (!rule.typeField || !rule.typeValue || !rule.translateField) return;

  const stack: JsonValue[] = [rootNode];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node == null) continue;

    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) stack.push(node[i]!);
      continue;
    }

    if (typeof node !== "object") continue;

    const obj = node as Record<string, JsonValue>;
    const typeNode = obj[rule.typeField];
    if (typeNode === rule.typeValue) {
      const textFieldNode = obj[rule.translateField];
      if (typeof textFieldNode === "string") {
        pushTextSlot(slots, dedup, obj, rule.translateField, textFieldNode);
      }
    }

    for (const child of Object.values(obj)) {
      if (child !== null && typeof child === "object") stack.push(child);
    }
  }
}

function collectByPathSegments(
  currentNode: JsonValue,
  segments: string[],
  segmentIndex: number,
  slots: JsonTextSlot[],
  dedup: Set<string>,
): void {
  if (currentNode == null || segmentIndex >= segments.length) return;

  const segment = segments[segmentIndex]!;
  const isLast = segmentIndex === segments.length - 1;

  if (Array.isArray(currentNode)) {
    for (const item of currentNode) {
      collectByPathSegments(item, segments, segmentIndex, slots, dedup);
    }
    return;
  }

  if (typeof currentNode !== "object") return;
  const obj = currentNode as Record<string, JsonValue>;

  if (segment.endsWith("[*]")) {
    const arrayFieldName = segment.slice(0, -3);
    const arrayNode = obj[arrayFieldName];
    if (Array.isArray(arrayNode)) {
      for (const item of arrayNode) {
        collectByPathSegments(item, segments, segmentIndex + 1, slots, dedup);
      }
    }
    return;
  }

  const nextNode = obj[segment];
  if (nextNode === undefined) return;

  if (isLast && typeof nextNode === "string") {
    pushTextSlot(slots, dedup, obj, segment, nextNode);
    return;
  }

  collectByPathSegments(nextNode, segments, segmentIndex + 1, slots, dedup);
}

function collectByPathRule(
  rootNode: JsonValue,
  rule: JsonExtractRule,
  slots: JsonTextSlot[],
  dedup: Set<string>,
): void {
  if (!rule.path) return;
  const segments = rule.path.split(".");
  collectByPathSegments(rootNode, segments, 0, slots, dedup);
}

/** Extract translatable string slots from a parsed JSON tree using configured rules. */
export function extractJsonTextSlots(
  rootNode: JsonValue,
  rules: JsonExtractRule[] = loadJsonExtractRules(),
): JsonTextSlot[] {
  const slots: JsonTextSlot[] = [];
  const dedup = new Set<string>();
  for (const rule of rules) {
    if (rule.mode === RULE_MODE_TYPE_MATCH) {
      collectByTypeMatchRule(rootNode, rule, slots, dedup);
    } else if (rule.mode === RULE_MODE_PATH) {
      collectByPathRule(rootNode, rule, slots, dedup);
    }
  }
  return slots;
}

/** True when any configured rule finds translatable text in the JSON string. */
export function jsonHasExtractableText(value: string, rules?: JsonExtractRule[]): boolean {
  const root = tryParseJsonContainer(value);
  if (root === undefined) return false;
  return extractJsonTextSlots(root, rules ?? loadJsonExtractRules()).length > 0;
}

export function tryParseJsonContainer(value: string): JsonValue | undefined {
  const t = value.trim();
  if (t.length < 2) return undefined;
  const c = t[0];
  if (c !== "{" && c !== "[") return undefined;
  try {
    const parsed = JSON.parse(t) as JsonValue;
    if (parsed !== null && typeof parsed === "object") return parsed;
  } catch {
    /* not JSON */
  }
  return undefined;
}

/** Shopify LIST metafield: JSON array of strings only. */
export function isListFormat(value: string): boolean {
  const t = value.trim();
  if (!t.startsWith("[")) return false;
  try {
    const parsed = JSON.parse(t) as unknown;
    return (
      Array.isArray(parsed) &&
      parsed.every((item) => item === null || typeof item === "string")
    );
  } catch {
    return false;
  }
}

/** Apply translated strings back into the JSON tree (mutates parents in slots). */
export function applyJsonSlotTranslations(
  slots: JsonTextSlot[],
  translated: Map<string, string>,
): void {
  for (const slot of slots) {
    const next = translated.get(slot.text);
    if (next !== undefined && next.trim()) {
      slot.parent[slot.fieldName] = next;
    }
  }
}
