import { z } from "zod";
import {
  DEFAULT_SOURCE_LANGUAGE,
  ERROR_MESSAGES,
} from "./constants";
import type {
  PictureTranslateResolvedInput,
  PictureTranslateToolInput,
} from "./types";

export const pictureTranslateToolSchema = z
  .object({
    imageUrl: z.string().trim().optional(),
    imageBase64: z.string().trim().optional(),
    targetLanguage: z
      .string()
      .trim()
      .min(1, "targetLanguage 必填")
      .describe("目标语言代码，例如 en、ja、fr、zh"),
    sourceLanguage: z
      .string()
      .trim()
      .optional()
      .describe("源语言代码，可选，默认 auto"),
  })
  .superRefine((value, ctx) => {
    const imageUrl = value.imageUrl?.trim() ?? "";
    const imageBase64 = value.imageBase64?.trim() ?? "";

    if (!imageUrl && !imageBase64) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: ERROR_MESSAGES.IMAGE_REQUIRED,
        path: ["imageUrl"],
      });
      return;
    }

    if (imageUrl && !/^https:\/\//i.test(imageUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: ERROR_MESSAGES.IMAGE_URL_HTTPS_REQUIRED,
        path: ["imageUrl"],
      });
    }
  });

export function resolvePictureTranslateInput(
  input: PictureTranslateToolInput,
): PictureTranslateResolvedInput {
  const imageUrl = input.imageUrl?.trim();
  const imageBase64 = input.imageBase64?.trim();
  const targetLanguage = input.targetLanguage.trim();
  const sourceLanguage =
    input.sourceLanguage?.trim() || DEFAULT_SOURCE_LANGUAGE;

  return {
    imageUrl: imageUrl || undefined,
    imageBase64: imageBase64 || undefined,
    targetLanguage,
    sourceLanguage,
  };
}
