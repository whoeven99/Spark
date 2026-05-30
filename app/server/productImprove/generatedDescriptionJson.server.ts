import { z } from "zod";
import { GENERATED_DESCRIPTION_MAX_LENGTH } from "./constants.server";
import { logDetailedError } from "./generateDescriptionLog.server";

const LOG_PREFIX = "[GenerateDescription][JSON]";

const productDescriptionJsonSchema = z.object({
  description: z
    .string()
    .min(1, "description 不能为空")
    .max(GENERATED_DESCRIPTION_MAX_LENGTH),
});

const productDescriptionReviewJsonSchema = z.object({
  title: z.string().min(1, "title 不能为空").max(200, "title 过长"),
  description: z
    .string()
    .min(1, "description 不能为空")
    .max(GENERATED_DESCRIPTION_MAX_LENGTH),
});

export type ProductDescriptionJsonPayload = z.infer<
  typeof productDescriptionJsonSchema
>;

export type ProductDescriptionReviewJsonPayload = z.infer<
  typeof productDescriptionReviewJsonSchema
>;

/** 去掉模型偶发的 Markdown 代码围栏，便于 JSON.parse。 */
export function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fence?.[1] ? fence[1].trim() : trimmed;
}

/**
 * 解析并校验模型输出的 JSON，必须为仅含 description 的对象。
 */
export function parseAndValidateProductDescriptionJson(
  rawText: string,
): ProductDescriptionJsonPayload {
  const parseStart = Date.now();
  const cleaned = stripJsonFence(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned) as unknown;
  } catch (e) {
    logDetailedError(LOG_PREFIX, "JSON.parse failed", e);
    console.info(
      `${LOG_PREFIX} parse failed totalMs=${Date.now() - parseStart}`,
    );
    throw new Error("AI 输出不是合法 JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.info(
      `${LOG_PREFIX} root type invalid totalMs=${Date.now() - parseStart}`,
    );
    throw new Error("AI 输出须为 JSON 对象");
  }
  const record = parsed as Record<string, unknown>;
  const extraKeys = Object.keys(record).filter((k) => k !== "description");
  if (extraKeys.length > 0) {
    console.info(
      `${LOG_PREFIX} extra keys=${extraKeys.join(",")} totalMs=${Date.now() - parseStart}`,
    );
    throw new Error("AI 输出 JSON 仅允许 description 字段");
  }
  const desc =
    typeof record.description === "string" ? record.description.trim() : "";
  const result = productDescriptionJsonSchema.safeParse({
    description: desc,
  });
  if (!result.success) {
    const msg = result.error.issues.map((i) => i.message).join("；");
    console.info(
      `${LOG_PREFIX} zod failed issues=${msg} totalMs=${Date.now() - parseStart}`,
    );
    throw new Error(msg || "AI 输出 JSON 校验失败");
  }
  console.info(
    `${LOG_PREFIX} ok descriptionLen=${result.data.description.length} totalMs=${Date.now() - parseStart}`,
  );
  return result.data;
}

export function parseAndValidateProductDescriptionReviewJson(
  rawText: string,
): ProductDescriptionReviewJsonPayload {
  const parseStart = Date.now();
  const cleaned = stripJsonFence(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned) as unknown;
  } catch (e) {
    logDetailedError(LOG_PREFIX, "review JSON.parse failed", e);
    console.info(
      `${LOG_PREFIX} review parse failed totalMs=${Date.now() - parseStart}`,
    );
    throw new Error("AI 输出不是合法 JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.info(
      `${LOG_PREFIX} review root type invalid totalMs=${Date.now() - parseStart}`,
    );
    throw new Error("AI 输出须为 JSON 对象");
  }
  const record = parsed as Record<string, unknown>;
  const extraKeys = Object.keys(record).filter(
    (k) => k !== "title" && k !== "description",
  );
  if (extraKeys.length > 0) {
    console.info(
      `${LOG_PREFIX} review extra keys=${extraKeys.join(",")} totalMs=${Date.now() - parseStart}`,
    );
    throw new Error("AI 输出 JSON 仅允许 title 和 description 字段");
  }
  const result = productDescriptionReviewJsonSchema.safeParse({
    title: typeof record.title === "string" ? record.title.trim() : "",
    description:
      typeof record.description === "string" ? record.description.trim() : "",
  });
  if (!result.success) {
    const msg = result.error.issues.map((i) => i.message).join("；");
    console.info(
      `${LOG_PREFIX} review zod failed issues=${msg} totalMs=${Date.now() - parseStart}`,
    );
    throw new Error(msg || "AI 输出 JSON 校验失败");
  }
  console.info(
    `${LOG_PREFIX} review ok titleLen=${result.data.title.length} descriptionLen=${result.data.description.length} totalMs=${Date.now() - parseStart}`,
  );
  return result.data;
}

/** @deprecated 使用 parseAndValidateProductDescriptionJson */
export function parseAndValidateGeneratedDescriptionJson(
  rawText: string,
): ProductDescriptionJsonPayload {
  return parseAndValidateProductDescriptionJson(rawText);
}

/** @deprecated 使用 ProductDescriptionJsonPayload */
export type GeneratedDescriptionPayload = ProductDescriptionJsonPayload;
