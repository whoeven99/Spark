import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  ImageGenerationApiResponse,
  ImagePromptApiResponse,
} from "../lib/imageGenerationTypes";

const LOG_PREFIX = "[useImageGeneration]";

export type UseImageGenerationParams = {
  locationSearch: string;
  toastShow: (message: string) => void;
};

export function useImageGeneration(params: UseImageGenerationParams) {
  const { locationSearch, toastShow } = params;
  const { t } = useTranslation();

  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [descriptionErrorText, setDescriptionErrorText] = useState("");
  const [promptErrorText, setPromptErrorText] = useState("");
  const [resultErrorText, setResultErrorText] = useState("");
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [hasSubmittedOnce, setHasSubmittedOnce] = useState(false);
  const [hasGeneratedPromptOnce, setHasGeneratedPromptOnce] = useState(false);

  const busy = isGeneratingPrompt || isSubmitting;

  const submitGeneratePrompt = useCallback(async () => {
    const trimmed = description.trim();
    setDescriptionErrorText("");
    setPromptErrorText("");

    if (trimmed.length < 4) {
      setDescriptionErrorText(t("imageGeneration.validationDescriptionMin"));
      return;
    }

    setIsGeneratingPrompt(true);
    const clientRequestId = crypto.randomUUID();
    console.info(
      `${LOG_PREFIX} prompt start requestId=${clientRequestId} descriptionLen=${trimmed.length}`,
    );

    try {
      const res = await fetch(`/api/generate-image-prompt${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: trimmed }),
      });

      const body = (await res.json()) as ImagePromptApiResponse;
      if (!body.success) {
        setDescriptionErrorText(body.errorMsg || t("imageGeneration.promptGenFailed"));
        return;
      }

      setPrompt(body.prompt);
      setHasGeneratedPromptOnce(true);
      toastShow(t("imageGeneration.promptGenSuccess"));
      console.info(`${LOG_PREFIX} prompt ok requestId=${body.requestId}`);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : t("imageGeneration.promptGenFailed");
      setDescriptionErrorText(msg);
      console.error(`${LOG_PREFIX} prompt error`, e);
    } finally {
      setIsGeneratingPrompt(false);
    }
  }, [description, locationSearch, t, toastShow]);

  const submitGenerate = useCallback(async () => {
    const trimmed = prompt.trim();
    setPromptErrorText("");
    setResultErrorText("");

    if (trimmed.length < 4) {
      setPromptErrorText(t("imageGeneration.validationPromptMin"));
      return;
    }

    setIsSubmitting(true);
    setHasSubmittedOnce(true);
    const clientRequestId = crypto.randomUUID();
    console.info(
      `${LOG_PREFIX} image start requestId=${clientRequestId} promptLen=${trimmed.length}`,
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
        return;
      }

      setGeneratedImageUrl(body.imageUrl);
      setRequestId(body.requestId);
      toastShow(t("imageGeneration.submitSuccess"));
      console.info(`${LOG_PREFIX} image ok requestId=${body.requestId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("imageGeneration.submitFailed");
      setResultErrorText(msg);
      console.error(`${LOG_PREFIX} image error`, e);
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
    description,
    setDescription,
    prompt,
    setPrompt,
    descriptionErrorText,
    promptErrorText,
    resultErrorText,
    isGeneratingPrompt,
    isSubmitting,
    busy,
    generatedImageUrl,
    requestId,
    hasSubmittedOnce,
    hasGeneratedPromptOnce,
    submitGeneratePrompt,
    submitGenerate,
    resetResult,
  };
};
