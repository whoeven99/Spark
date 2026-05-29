import {
  isImageGenerationConfigured,
  resolveImageGenerationProvider,
} from "./imageGenerationConfig.server";
import { openAiGenerateImageToBytes } from "./openAiImageGenerate.server";
import { volcengineGenerateImageToBytes } from "./volcengineImageGenerate.server";

export type GenerateImageBytesFailure = {
  ok: false;
  reasonCode: string;
  detail?: string;
};

export type GenerateImageBytesOk = { ok: true; bytes: Buffer };

export { isImageGenerationConfigured, resolveImageGenerationProvider };

export async function generateImageToBytes(params: {
  prompt: string;
}): Promise<GenerateImageBytesOk | GenerateImageBytesFailure> {
  const provider = resolveImageGenerationProvider();
  if (!provider) {
    return { ok: false, reasonCode: "credentials_missing" };
  }

  if (provider === "openai") {
    return openAiGenerateImageToBytes(params);
  }

  return volcengineGenerateImageToBytes(params);
}
