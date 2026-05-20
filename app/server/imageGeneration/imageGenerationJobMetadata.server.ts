import type { Prisma } from "../../generated/prisma";

export type ImageGenerationJobMetadata = {
  description: string;
};

export function buildImageGenerationJobMetadata(params: {
  description: string;
}): Prisma.InputJsonValue {
  return {
    description: params.description.trim(),
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
  if (!description) {
    return null;
  }
  return { description };
}
