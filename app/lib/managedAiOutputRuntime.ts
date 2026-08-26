import type { ManagedAiLaunchContext } from "./managedAiLaunchContext";
import { validateTodayManagedOutput, type TodayManagedOutputSchemaKey } from "./todayAiOutputSchemas";

export type ManagedAiOutputParseResult =
  | {
      success: true;
      schemaKey: TodayManagedOutputSchemaKey;
      data: unknown;
      rawText: string;
    }
  | {
      success: false;
      schemaKey: TodayManagedOutputSchemaKey;
      reason: "no_json" | "invalid_json" | "schema_mismatch";
      rawText: string;
    };

export function tryParseManagedAiOutput(
  text: string,
  context: ManagedAiLaunchContext | null | undefined,
): ManagedAiOutputParseResult | null {
  if (!context) return null;
  if (!isTodayManagedOutputSchemaKey(context.outputSchemaKey)) return null;

  const rawText = text.trim();
  if (!rawText) {
    return {
      success: false,
      schemaKey: context.outputSchemaKey,
      reason: "no_json",
      rawText,
    };
  }

  const jsonCandidate = extractJsonCandidate(rawText);
  if (!jsonCandidate) {
    return {
      success: false,
      schemaKey: context.outputSchemaKey,
      reason: "no_json",
      rawText,
    };
  }

  try {
    const parsedJson = JSON.parse(jsonCandidate) as unknown;
    const validated = validateTodayManagedOutput(context.outputSchemaKey, parsedJson);
    if (validated.success) {
      return {
        success: true,
        schemaKey: context.outputSchemaKey,
        data: validated.data,
        rawText,
      };
    }
    return {
      success: false,
      schemaKey: context.outputSchemaKey,
      reason: "schema_mismatch",
      rawText,
    };
  } catch {
    return {
      success: false,
      schemaKey: context.outputSchemaKey,
      reason: "invalid_json",
      rawText,
    };
  }
}

function extractJsonCandidate(text: string): string | null {
  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]?.trim()) return fencedMatch[1].trim();

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1).trim();
  }
  return null;
}

function isTodayManagedOutputSchemaKey(value: string): value is TodayManagedOutputSchemaKey {
  return (
    value === "today.page.analysis.reply.v1" ||
    value === "today.object.analysis.reply.v1" ||
    value === "today.group.analysis.reply.v1" ||
    value === "today.todo.refine.v1"
  );
}
