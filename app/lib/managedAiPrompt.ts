import { z } from "zod";

const nonEmptyStringSchema = z.string().trim().min(1);

export const managedAiPromptBlockSchema = z.object({
  key: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  lines: z.array(nonEmptyStringSchema).min(1),
});

export const managedAiPromptSpecSchema = z.object({
  version: z.literal("v1"),
  registryKey: nonEmptyStringSchema,
  contextSchemaKey: nonEmptyStringSchema,
  outputSchemaKey: nonEmptyStringSchema,
  role: nonEmptyStringSchema,
  objective: nonEmptyStringSchema,
  output: z.array(nonEmptyStringSchema).min(1),
  guardrails: z.array(nonEmptyStringSchema).min(1),
  introLines: z.array(nonEmptyStringSchema),
  contextBlocks: z.array(managedAiPromptBlockSchema).min(1),
});

export type ManagedAiPromptBlock = z.infer<typeof managedAiPromptBlockSchema>;
export type ManagedAiPromptSpec = z.infer<typeof managedAiPromptSpecSchema>;

export type ManagedAiPromptTemplate<TInput> = {
  registryKey: string;
  contextSchemaKey: string;
  outputSchemaKey: string;
  role: string;
  objective: string;
  output: string[];
  guardrails: string[];
  buildIntroLines: (input: TInput) => string[];
  buildContextBlocks: (input: TInput) => ManagedAiPromptBlock[];
};

export function buildManagedAiPrompt<TInput>(
  template: ManagedAiPromptTemplate<TInput>,
  input: TInput,
): {
  spec: ManagedAiPromptSpec;
  prompt: {
    system: string;
    user: string;
  };
  chatPrompt: string;
} {
  const spec: ManagedAiPromptSpec = {
    version: "v1",
    registryKey: template.registryKey,
    contextSchemaKey: template.contextSchemaKey,
    outputSchemaKey: template.outputSchemaKey,
    role: template.role,
    objective: template.objective,
    output: template.output,
    guardrails: template.guardrails,
    introLines: template.buildIntroLines(input).filter((line) => line.trim().length > 0),
    contextBlocks: template.buildContextBlocks(input),
  };

  const parsed = managedAiPromptSpecSchema.safeParse(spec);
  if (!parsed.success) {
    console.error("[managed-ai-prompt] invalid spec:", parsed.error.flatten());
  }
  const normalized = parsed.success ? parsed.data : spec;

  const system = [
    `你是 ${normalized.role}。`,
    `场景 Key：${normalized.registryKey}`,
    `上下文 Schema：${normalized.contextSchemaKey}`,
    `输出 Schema：${normalized.outputSchemaKey}`,
    `当前目标：${normalized.objective}`,
    "",
    "输出要求：",
    ...normalized.output.map((line) => `- ${line}`),
    "",
    "约束：",
    ...normalized.guardrails.map((line) => `- ${line}`),
  ].join("\n");

  const user = [
    ...normalized.introLines,
    "",
    ...normalized.contextBlocks.flatMap((block) => [
      `${block.title}：`,
      ...block.lines.map((line) => `- ${line}`),
      "",
    ]),
  ]
    .join("\n")
    .trim();

  return {
    spec: normalized,
    prompt: { system, user },
    chatPrompt: [system, "", user].join("\n").trim(),
  };
}
