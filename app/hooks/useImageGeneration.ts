import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AITaskCreateResponse, AITaskType } from "../lib/aiTaskTypes";

const LOG_PREFIX = "[useImageGeneration]";

export type UseImageGenerationParams = {
  locationSearch: string;
  toastShow: (message: string) => void;
  onTaskCreated?: (
    taskId: string,
    batchId: string,
    taskType: AITaskType,
    optimisticConfig?: Record<string, unknown>,
  ) => void;
};

export function useImageGeneration(params: UseImageGenerationParams) {
  const { locationSearch, toastShow, onTaskCreated } = params;
  const { t } = useTranslation();

  const [description, setDescription] = useState("");
  const [descriptionErrorText, setDescriptionErrorText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const prepareSubmit = useCallback(() => {
    const trimmed = description.trim();
    setDescriptionErrorText("");

    if (trimmed.length < 4) {
      setDescriptionErrorText(t("imageGeneration.validationDescriptionMin"));
      return null;
    }

    return trimmed;
  }, [description, t]);

  const submitGenerate = useCallback(async () => {
    const trimmed = prepareSubmit();
    if (!trimmed) return;

    setIsSubmitting(true);
    console.info(`${LOG_PREFIX} start descriptionLen=${trimmed.length}`);

    try {
      const res = await fetch(`/api/generate-image${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: trimmed }),
      });

      const body = (await res.json()) as AITaskCreateResponse;
      if (!body.success) {
        setDescriptionErrorText(body.errorMsg || t("imageGeneration.submitFailed"));
        return;
      }

      console.info(
        `${LOG_PREFIX} task created taskId=${body.taskId} batchId=${body.batchId}`,
      );
      toastShow(t("imageGeneration.submitSuccess"));
      onTaskCreated?.(body.taskId, body.batchId, "image_generation", {
        description: trimmed,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("imageGeneration.submitFailed");
      setDescriptionErrorText(msg);
      console.error(`${LOG_PREFIX} error`, e);
    } finally {
      setIsSubmitting(false);
    }
  }, [locationSearch, onTaskCreated, prepareSubmit, t, toastShow]);

  return {
    description,
    setDescription,
    descriptionErrorText,
    isSubmitting,
    prepareSubmit,
    submitGenerate,
  };
}
