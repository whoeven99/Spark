import { z } from "zod";
import {
  AGENT_ALLOWED_TEMPLATE_IDS,
  isAgentAllowedTemplateId,
} from "./constants";

const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const sendTemplateEmailToolSchema = z
  .object({
    to: z
      .string()
      .trim()
      .min(1, "to 必填")
      .refine((value) => EMAIL_ADDRESS_PATTERN.test(value), {
        message: "to 必须是有效的邮箱地址",
      }),
    subject: z.string().trim().min(1, "subject 必填"),
    templateId: z
      .number()
      .int("templateId 必须是整数")
      .positive("templateId 必须为正数"),
    templateData: z.record(z.string(), z.string()).optional(),
  })
  .superRefine((value, ctx) => {
    if (!isAgentAllowedTemplateId(value.templateId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `templateId 不在允许列表内，可选 ID：${AGENT_ALLOWED_TEMPLATE_IDS.join(", ")}`,
        path: ["templateId"],
      });
    }
  });

export type SendTemplateEmailToolInput = z.infer<typeof sendTemplateEmailToolSchema>;
