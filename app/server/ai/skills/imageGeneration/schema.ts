import { z } from "zod";
import { MAX_PROMPT_CHARS, MIN_PROMPT_CHARS } from "../../../imageGeneration/constants.server";

export const generateProductImageToolSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(MIN_PROMPT_CHARS, `提示词至少 ${MIN_PROMPT_CHARS} 个字符`)
    .max(MAX_PROMPT_CHARS, `提示词不能超过 ${MAX_PROMPT_CHARS} 个字符`)
    .describe("用于生成商品/营销图片的画面描述，例如风格、主体、背景、光线等"),
});

export type GenerateProductImageToolInput = z.infer<
  typeof generateProductImageToolSchema
>;
