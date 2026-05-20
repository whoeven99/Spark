import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  ImageGenerationApiResponse,
  ImageGenerationStatusApiResponse,
  ImagePromptApiResponse,
} from "../lib/imageGenerationTypes";
import type { ShopVisualJobHistoryItem } from "../lib/shopVisualJobTypes";

const LOG_PREFIX = "[useImageGeneration]";
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_MS = 300_000;

export type UseImageGenerationParams = {
  locationSearch: string;
  toastShow: (message: string) => void;
  initialHistory?: ShopVisualJobHistoryItem[];
};

export function useImageGeneration(params: UseImageGenerationParams) {
  const { locationSearch, toastShow, initialHistory = [] } = params;
  const { t } = useTranslation();

  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [descriptionErrorText, setDescriptionErrorText] = useState("");
  const [promptErrorText, setPromptErrorText] = useState("");
  const [resultErrorText, setResultErrorText] = useState("");
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [hasSubmittedOnce, setHasSubmittedOnce] = useState(false);
  const [hasGeneratedPromptOnce, setHasGeneratedPromptOnce] = useState(false);
  const [history, setHistory] = useState<ShopVisualJobHistoryItem[]>(initialHistory);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartedRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    pollStartedRef.current = null;
    setIsPolling(false);
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  useEffect(() => {
    setHistory(initialHistory);
  }, [initialHistory]);

  const upsertHistoryItem = useCallback((item: ShopVisualJobHistoryItem) => {
    setHistory((prev) => {
      const rest = prev.filter((h) => h.requestId !== item.requestId);
      return [item, ...rest].slice(0, 12);
    });
  }, []);

  const pollJobStatus = useCallback(
    async (jobRequestId: string) => {
      const sep = locationSearch.includes("?") ? "&" : "?";
      const res = await fetch(
        `/api/generate-image-status${locationSearch}${sep}requestId=${encodeURIComponent(jobRequestId)}`,
      );
      const body = (await res.json()) as ImageGenerationStatusApiResponse;
      if (!body.success) {
        throw new Error(body.errorMsg || t("imageGeneration.submitFailed"));
      }
      return body;
    },
    [locationSearch, t],
  );

  const startPolling = useCallback(
    (jobRequestId: string, jobPrompt: string) => {
      stopPolling();
      setIsPolling(true);
      pollStartedRef.current = Date.now();

      const tick = async () => {
        const startedAt = pollStartedRef.current ?? Date.now();
        if (Date.now() - startedAt > POLL_MAX_MS) {
          stopPolling();
          setResultErrorText(t("imageGeneration.pollTimeout"));
          upsertHistoryItem({
            requestId: jobRequestId,
            kind: "image_generation",
            summary: jobPrompt,
            status: "pending",
            imageUrl: null,
            errorMsg: null,
            provider: null,
            createdAt: new Date().toISOString(),
          });
          return;
        }

        try {
          const body = await pollJobStatus(jobRequestId);
          if (body.status === "pending") {
            return;
          }

          stopPolling();
          setIsSubmitting(false);

          if (body.status === "succeeded") {
            setGeneratedImageUrl(body.imageUrl);
            setRequestId(body.requestId);
            setResultErrorText("");
            toastShow(t("imageGeneration.submitSuccess"));
            upsertHistoryItem({
              requestId: body.requestId,
              kind: "image_generation",
              summary: jobPrompt,
              status: "succeeded",
              imageUrl: body.imageUrl,
              errorMsg: null,
              provider: null,
              createdAt: new Date().toISOString(),
            });
            return;
          }

          const msg = body.errorMsg || t("imageGeneration.submitFailed");
          setResultErrorText(msg);
          upsertHistoryItem({
            requestId: body.requestId,
            kind: "image_generation",
            summary: jobPrompt,
            status: "failed",
            imageUrl: null,
            errorMsg: msg,
            provider: null,
            createdAt: new Date().toISOString(),
          });
        } catch (e) {
          console.error(`${LOG_PREFIX} poll error`, e);
        }
      };

      void tick();
      pollTimerRef.current = setInterval(() => void tick(), POLL_INTERVAL_MS);
    },
    [pollJobStatus, stopPolling, t, toastShow, upsertHistoryItem],
  );

  const busy = isGeneratingPrompt || isSubmitting || isPolling;

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
    stopPolling();

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
        setIsSubmitting(false);
        return;
      }

      setRequestId(body.requestId);

      if (body.status === "pending") {
        setGeneratedImageUrl(null);
        setResultErrorText("");
        upsertHistoryItem({
          requestId: body.requestId,
          kind: "image_generation",
          summary: trimmed,
          status: "pending",
          imageUrl: null,
          errorMsg: null,
          provider: null,
          createdAt: new Date().toISOString(),
        });
        startPolling(body.requestId, trimmed);
        return;
      }

      setGeneratedImageUrl(body.imageUrl);
      setResultErrorText("");
      setIsSubmitting(false);
      toastShow(t("imageGeneration.submitSuccess"));
      upsertHistoryItem({
        requestId: body.requestId,
        kind: "image_generation",
        summary: trimmed,
        status: "succeeded",
        imageUrl: body.imageUrl,
        errorMsg: null,
        provider: null,
        createdAt: new Date().toISOString(),
      });
      console.info(`${LOG_PREFIX} image ok requestId=${body.requestId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("imageGeneration.submitFailed");
      setResultErrorText(msg);
      setIsSubmitting(false);
      console.error(`${LOG_PREFIX} image error`, e);
    }
  }, [
    locationSearch,
    prompt,
    startPolling,
    stopPolling,
    t,
    toastShow,
    upsertHistoryItem,
  ]);

  const selectHistoryItem = useCallback((item: ShopVisualJobHistoryItem) => {
    stopPolling();
    setIsSubmitting(false);
    setRequestId(item.requestId);
    setPrompt(item.summary);
    setHasSubmittedOnce(true);
    if (item.status === "succeeded" && item.imageUrl) {
      setGeneratedImageUrl(item.imageUrl);
      setResultErrorText("");
      return;
    }
    if (item.status === "failed") {
      setGeneratedImageUrl(null);
      setResultErrorText(item.errorMsg || t("imageGeneration.submitFailed"));
      return;
    }
    setGeneratedImageUrl(null);
    setResultErrorText("");
    startPolling(item.requestId, item.summary);
  }, [startPolling, stopPolling, t]);

  const resetResult = useCallback(() => {
    stopPolling();
    setGeneratedImageUrl(null);
    setRequestId(null);
    setResultErrorText("");
    setHasSubmittedOnce(false);
    setIsSubmitting(false);
  }, [stopPolling]);

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
    isPolling,
    busy,
    generatedImageUrl,
    requestId,
    hasSubmittedOnce,
    hasGeneratedPromptOnce,
    history,
    submitGeneratePrompt,
    submitGenerate,
    resetResult,
    selectHistoryItem,
  };
};
