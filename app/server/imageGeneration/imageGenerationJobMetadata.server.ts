import type { Prisma } from "../../generated/prisma";

export type ImageGenerationJobMetadata = {
  description: string;
  prompt: string;
};

export function buildImageGenerationJobMetadata(params: {
  description: string;
  prompt: string;
}): Prisma.InputJsonValue {
  return {
    description: params.description.trim(),
    prompt: params.prompt.trim(),
  };
}

export function parseImageGenerationJobMetadata(
  raw: unknown,
): ImageGenerationJobMetadata | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const description =
    typeof obj.description === "string" ? obj.description.trim() : "";
  const prompt = typeof obj.prompt === "string" ? obj.prompt.trim() : "";
  if (!description && !prompt) {
    return null;
  }
  return { description, prompt };
}
