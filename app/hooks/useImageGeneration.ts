import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ImageGenerationApiResponse } from "../lib/imageGenerationTypes";

const LOG_PREFIX = "[useImageGeneration]";

export type UseImageGenerationParams = {
  locationSearch: string;
  toastShow: (message: string) => void;
};

export function useImageGeneration(params: UseImageGenerationParams) {
  const { locationSearch, toastShow } = params;
  const { t } = useTranslation();

  const [prompt, setPrompt] = useState("");
  const [formErrorText, setFormErrorText] = useState("");
  const [resultErrorText, setResultErrorText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [hasSubmittedOnce, setHasSubmittedOnce] = useState(false);

  const submitGenerate = useCallback(async () => {
    const trimmed = prompt.trim();
    setFormErrorText("");
    setResultErrorText("");

    if (trimmed.length < 4) {
      setFormErrorText(t("imageGeneration.validationPromptMin"));
      return;
    }

    setIsSubmitting(true);
    setHasSubmittedOnce(true);
    const clientRequestId = crypto.randomUUID();
    console.info(
      `${LOG_PREFIX} submit start requestId=${clientRequestId} promptLen=${trimmed.length}`,
    );

    try {
      const res = await fetch(`/api/generate-image${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });

      const body = (await res.json()) as ImageGenerationApiResponse;
      if (!body.success) {
        const msg = body.errorMsg || t("imageGeneration.submitFailed");
        setResultErrorText(msg);
        console.info(
          `${LOG_PREFIX} submit failed requestId=${body.requestId ?? clientRequestId} status=${res.status}`,
        );
        return;
      }

      setGeneratedImageUrl(body.imageUrl);
      setRequestId(body.requestId);
      toastShow(t("imageGeneration.submitSuccess"));
      console.info(
        `${LOG_PREFIX} submit ok requestId=${body.requestId} status=${res.status}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("imageGeneration.submitFailed");
      setResultErrorText(msg);
      console.error(`${LOG_PREFIX} submit error`, e);
    } finally {
      setIsSubmitting(false);
    }
  }, [locationSearch, prompt, t, toastShow]);

  const resetResult = useCallback(() => {
    setGeneratedImageUrl(null);
    setRequestId(null);
    setResultErrorText("");
    setHasSubmittedOnce(false);
  }, []);

  return {
    prompt,
    setPrompt,
    formErrorText,
    resultErrorText,
    isSubmitting,
    generatedImageUrl,
    requestId,
    hasSubmittedOnce,
    submitGenerate,
    resetResult,
  };
}
