import { z } from "zod";

const nonEmptyStringSchema = z.string().trim().min(1);

export const aiDrilldownMetricSchema = z.object({
  label: nonEmptyStringSchema,
  value: nonEmptyStringSchema,
  unit: z.string().optional(),
});

export const aiDrilldownStatusSchema = z.object({
  label: nonEmptyStringSchema,
  status: z.enum(["healthy", "watch", "risk"]),
  detail: nonEmptyStringSchema,
});

export const aiDrilldownActionSchema = z.object({
  title: nonEmptyStringSchema,
  detail: nonEmptyStringSchema,
  priority: z.enum(["P0", "P1", "P2"]),
});

export const aiDrilldownContextSchema = z.object({
  version: z.literal("v1"),
  contextType: z.enum(["today", "health", "settings"]),
  pageKey: nonEmptyStringSchema,
  promptRegistryKey: nonEmptyStringSchema.optional(),
  promptContextSchemaKey: nonEmptyStringSchema.optional(),
  promptOutputSchemaKey: nonEmptyStringSchema.optional(),
  title: nonEmptyStringSchema,
  summary: nonEmptyStringSchema,
  primaryQuestion: nonEmptyStringSchema,
  metrics: z.array(aiDrilldownMetricSchema).min(1),
  statuses: z.array(aiDrilldownStatusSchema).min(1),
  suggestedActions: z.array(aiDrilldownActionSchema).min(1),
  chatPrompt: nonEmptyStringSchema,
});

export type AiDrilldownMetric = z.infer<typeof aiDrilldownMetricSchema>;
export type AiDrilldownStatus = z.infer<typeof aiDrilldownStatusSchema>;
export type AiDrilldownAction = z.infer<typeof aiDrilldownActionSchema>;
export type AiDrilldownContext = z.infer<typeof aiDrilldownContextSchema>;
