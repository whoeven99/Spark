import { z } from "zod";
import { buildEmailScenarioCatalog, EMAIL_SCENARIO_KEYS } from "./email.constants";

export const sendTemplateEmailToolSchema = z.object({
  subject: z.string().trim().min(1, "subject 必填"),
  scenario: z
    .enum(EMAIL_SCENARIO_KEYS)
    .describe(`邮件场景，可选值：${buildEmailScenarioCatalog()}`),
  templateData: z.record(z.string(), z.string()).optional(),
});

export type SendTemplateEmailToolInput = z.infer<typeof sendTemplateEmailToolSchema>;
