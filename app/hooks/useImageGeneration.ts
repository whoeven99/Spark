import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  ImageGenerationApiResponse,
  ImageGenerationStatusApiResponse,
} from "../lib/imageGenerationTypes";
import { postDeleteShopVisualJob } from "../lib/shopVisualJobApi";
import type { ShopVisualJobHistoryItem } from "../lib/shopVisualJobTypes";

const LOG_PREFIX = "[useImageGeneration]";
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_MS = 300_000;

export type UseImageGenerationParams = {
  locationSearch: string;
  toastShow: (message: string) => void;
  initialHistory?: ShopVisualJobHistoryItem[];
};

function historySummary(item: ShopVisualJobHistoryItem): string {
  return item.description?.trim() || item.summary;
}

export function useImageGeneration(params: UseImageGenerationParams) {
  const { locationSearch, toastShow, initialHistory = [] } = params;
  const { t } = useTranslation();

  const [description, setDescription] = useState("");
  const [descriptionErrorText, setDescriptionErrorText] = useState("");
  const [resultErrorText, setResultErrorText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [hasSubmittedOnce, setHasSubmittedOnce] = useState(false);
  const [history, setHistory] = useState<ShopVisualJobHistoryItem[]>(initialHistory);
  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null);

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
    (jobRequestId: string, jobItem: ShopVisualJobHistoryItem) => {
      stopPolling();
      setIsPolling(true);
      pollStartedRef.current = Date.now();

      const tick = async () => {
        const startedAt = pollStartedRef.current ?? Date.now();
        if (Date.now() - startedAt > POLL_MAX_MS) {
          stopPolling();
          setResultErrorText(t("imageGeneration.pollTimeout"));
          upsertHistoryItem({
            ...jobItem,
            requestId: jobRequestId,
            status: "pending",
            imageUrl: null,
            errorMsg: null,
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
              ...jobItem,
              requestId: body.requestId,
              status: "succeeded",
              imageUrl: body.imageUrl,
              errorMsg: null,
            });
            return;
          }

          const msg = body.errorMsg || t("imageGeneration.submitFailed");
          setResultErrorText(msg);
          upsertHistoryItem({
            ...jobItem,
            requestId: body.requestId,
            status: "failed",
            imageUrl: null,
            errorMsg: msg,
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

  const busy = isSubmitting || isPolling;

  const submitGenerate = useCallback(async () => {
    const trimmed = description.trim();
    setDescriptionErrorText("");
    setResultErrorText("");
    stopPolling();

    if (trimmed.length < 4) {
      setDescriptionErrorText(t("imageGeneration.validationDescriptionMin"));
      return;
    }

    setIsSubmitting(true);
    setHasSubmittedOnce(true);
    const clientRequestId = crypto.randomUUID();
    console.info(
      `${LOG_PREFIX} start requestId=${clientRequestId} descriptionLen=${trimmed.length}`,
    );

    const pendingHistoryBase: ShopVisualJobHistoryItem = {
      requestId: clientRequestId,
      kind: "image_generation",
      summary: trimmed,
      description: trimmed,
      status: "pending",
      imageUrl: null,
      errorMsg: null,
      provider: null,
      createdAt: new Date().toISOString(),
    };

    try {
      const res = await fetch(`/api/generate-image${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: trimmed }),
      });

      const body = (await res.json()) as ImageGenerationApiResponse;
      if (!body.success) {
        const msg = body.errorMsg || t("imageGeneration.submitFailed");
        setDescriptionErrorText(msg);
        setIsSubmitting(false);
        return;
      }

      setRequestId(body.requestId);
      const historyItem: ShopVisualJobHistoryItem = {
        ...pendingHistoryBase,
        requestId: body.requestId,
      };

      if (body.status === "pending") {
        setGeneratedImageUrl(null);
        setResultErrorText("");
        upsertHistoryItem(historyItem);
        startPolling(body.requestId, historyItem);
        return;
      }

      setGeneratedImageUrl(body.imageUrl);
      setResultErrorText("");
      setIsSubmitting(false);
      toastShow(t("imageGeneration.submitSuccess"));
      upsertHistoryItem({
        ...historyItem,
        status: "succeeded",
        imageUrl: body.imageUrl,
      });
      console.info(`${LOG_PREFIX} ok requestId=${body.requestId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("imageGeneration.submitFailed");
      setDescriptionErrorText(msg);
      setIsSubmitting(false);
      console.error(`${LOG_PREFIX} error`, e);
    }
  }, [
    description,
    locationSearch,
    startPolling,
    stopPolling,
    t,
    toastShow,
    upsertHistoryItem,
  ]);

  const selectHistoryItem = useCallback(
    (item: ShopVisualJobHistoryItem) => {
      stopPolling();
      setIsSubmitting(false);
      setRequestId(item.requestId);
      setDescription(item.description?.trim() || historySummary(item));
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
      startPolling(item.requestId, item);
    },
    [startPolling, stopPolling, t],
  );

  const resetResult = useCallback(() => {
    stopPolling();
    setGeneratedImageUrl(null);
    setRequestId(null);
    setResultErrorText("");
    setHasSubmittedOnce(false);
    setIsSubmitting(false);
  }, [stopPolling]);

  const deleteHistoryItem = useCallback(
    async (item: ShopVisualJobHistoryItem) => {
      setDeletingRequestId(item.requestId);
      try {
        const body = await postDeleteShopVisualJob({
          locationSearch,
          requestId: item.requestId,
        });
        if (!body.success) {
          toastShow(body.errorMsg || t("visualHistory.deleteFailed"));
          return;
        }
        setHistory((prev) => prev.filter((h) => h.requestId !== item.requestId));
        if (requestId === item.requestId) {
          resetResult();
        }
        toastShow(t("visualHistory.deleteSuccess"));
      } catch (e) {
        console.error(`${LOG_PREFIX} delete error`, e);
        toastShow(t("visualHistory.deleteFailed"));
      } finally {
        setDeletingRequestId(null);
      }
    },
    [locationSearch, requestId, resetResult, t, toastShow],
  );

  return {
    description,
    setDescription,
    descriptionErrorText,
    resultErrorText,
    isSubmitting,
    isPolling,
    busy,
    generatedImageUrl,
    requestId,
    hasSubmittedOnce,
    history,
    submitGenerate,
    resetResult,
    selectHistoryItem,
    deleteHistoryItem,
    deletingRequestId,
  };
};
