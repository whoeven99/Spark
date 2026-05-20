import { z } from "zod";

export const sendEmailRequestSchema = z.object({
  templateId: z.number().int().positive(),
  templateData: z.record(z.string(), z.string()).default({}),
  subject: z.string().min(1),
  from: z.string().email(),
  to: z.string().email(),
  cc: z.array(z.string().email()).optional(),
});

export type SendEmailRequest = z.infer<typeof sendEmailRequestSchema>;
