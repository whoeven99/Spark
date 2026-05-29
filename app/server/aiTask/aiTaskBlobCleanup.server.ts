import { deleteTranslateV3BlobIfExists } from "../translation/translateBlobStore.server";
import type { AITaskType } from "../../lib/aiTaskTypes";

export async function cleanupTaskBlobs(
  taskType: AITaskType,
  result: Record<string, unknown> | null,
): Promise<void> {
  if (!result) return;
  const paths = collectResultBlobPaths(taskType, result);
  for (const path of paths) {
    await deleteTranslateV3BlobIfExists(path);
  }
}

function collectResultBlobPaths(
  taskType: AITaskType,
  result: Record<string, unknown>,
): string[] {
  const paths: string[] = [];
  if (taskType === "image_generation") {
    addPath(paths, result.blobPath);
  } else if (taskType === "picture_translate") {
    addPath(paths, result.translatedBlobPath);
    addPath(paths, result.originalBlobPath);
  }
  return paths;
}

function addPath(paths: string[], value: unknown): void {
  if (typeof value === "string" && value.trim()) {
    paths.push(value.trim());
  }
}
