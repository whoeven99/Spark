import { z } from "zod";
import type { ManagedAiPromptSpec } from "./managedAiPrompt";

const nonEmptyStringSchema = z.string().trim().min(1);

export const managedAiLaunchContextSchema = z.object({
  version: z.literal("v1"),
  registryKey: nonEmptyStringSchema,
  contextSchemaKey: nonEmptyStringSchema,
  outputSchemaKey: nonEmptyStringSchema,
});

export type ManagedAiLaunchContext = z.infer<typeof managedAiLaunchContextSchema>;

export function buildManagedAiLaunchContextFromSpec(spec: ManagedAiPromptSpec): ManagedAiLaunchContext {
  return {
    version: "v1",
    registryKey: spec.registryKey,
    contextSchemaKey: spec.contextSchemaKey,
    outputSchemaKey: spec.outputSchemaKey,
  };
}

export function parseManagedAiLaunchContext(raw: string | null | undefined): ManagedAiLaunchContext | null {
  if (!raw) return null;
  try {
    const parsedJson = JSON.parse(raw) as unknown;
    const parsed = managedAiLaunchContextSchema.safeParse(parsedJson);
    if (parsed.success) return parsed.data;
    console.error("[managed-ai-launch-context] invalid context:", parsed.error.flatten());
    return null;
  } catch (error) {
    console.error("[managed-ai-launch-context] parse failed:", error);
    return null;
  }
}

export function serializeManagedAiLaunchContext(value: ManagedAiLaunchContext | null | undefined): string | null {
  if (!value) return null;
  const parsed = managedAiLaunchContextSchema.safeParse(value);
  if (!parsed.success) {
    console.error("[managed-ai-launch-context] serialize invalid context:", parsed.error.flatten());
    return null;
  }
  return JSON.stringify(parsed.data);
}
