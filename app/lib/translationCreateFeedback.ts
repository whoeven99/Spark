import type { TFunction } from "i18next";
import type { CreateTranslationV4TasksResult } from "./createTranslationV4Tasks";

export function resolveValidationErrorMessage(
  validationError: string,
  t: TFunction,
): string {
  if (validationError === "validationTargetRequired") {
    return t("translationRuntime.validationTargetRequired");
  }
  if (validationError === "validationSameLocale") {
    return t("translation.validationSameLocale");
  }
  return validationError;
}

/** 根据批量创建结果返回 toast 文案；无创建成功且无校验错误时返回 null。 */
export function formatCreateTasksToast(
  result: CreateTranslationV4TasksResult,
  t: TFunction,
): string | null {
  const { created, failed, validationError } = result;
  if (validationError) {
    return resolveValidationErrorMessage(validationError, t);
  }
  if (!created.length && failed.length) {
    return failed[0]?.error ?? t("translation.createFailedRetry");
  }
  if (created.length && failed.length) {
    return t("translationRuntime.createPartialFailure", {
      success: created.length,
      failed: failed.length,
    });
  }
  if (created.length === 1) {
    return t("translationRuntime.createSuccess");
  }
  if (created.length > 1) {
    return t("translationRuntime.createSuccessMultiple", { count: created.length });
  }
  return null;
}
