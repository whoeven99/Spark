import { isOpenAiImageConfigured } from "./openAiImageGenerate.server";
import { isVolcengineConfigured } from "../volcengine/volcCredentials.server";

export type ImageGenerationProvider = "openai" | "volc";

export function resolveImageGenerationProvider(): ImageGenerationProvider | null {
  const explicit = process.env.IMAGE_GEN_PROVIDER?.trim().toLowerCase();

  if (explicit === "volc") {
    return isVolcengineConfigured() ? "volc" : null;
  }

  if (explicit === "openai") {
    return isOpenAiImageConfigured() ? "openai" : null;
  }

  if (isOpenAiImageConfigured()) {
    return "openai";
  }

  if (isVolcengineConfigured()) {
    return "volc";
  }

  return null;
}

export function isImageGenerationConfigured(): boolean {
  const raw = process.env.IMAGE_GENERATION_ENABLED?.trim().toLowerCase();
  if (raw === "false" || raw === "0") return false;
  return resolveImageGenerationProvider() != null;
}
