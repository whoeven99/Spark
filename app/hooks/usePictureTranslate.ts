import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  filterPictureTranslateSourceLanguages,
  filterPictureTranslateTargetLanguages,
  type PictureTranslateProvider,
} from "../config/pictureTranslateLanguages";
import type {
  PictureTranslateChatResponse,
  PictureTranslateImageSource,
  PictureTranslateLanguageOption,
  PictureTranslateResultMeta,
} from "../lib/pictureTranslateTypes";
import type { ProductSearchItem } from "../lib/productSearchTypes";
import { useProductSearch } from "./useProductSearch";

const LOG_PREFIX = "[usePictureTranslate]";
const PICTURE_TRANSLATE_PROVIDER: PictureTranslateProvider | null = null;
const PRODUCT_SEARCH_DEBOUNCE_MS = 300;

import type { ShopVisualJobHistoryItem } from "../lib/shopVisualJobTypes";

export type UsePictureTranslateParams = {
  locationSearch: string;
  toastShow: (message: string) => void;
  mode: "page" | "card";
  initialHistory?: ShopVisualJobHistoryItem[];
  onSuccess?: (detail: { translatedImage: string; message: string }) => void;
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_file_failed"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result.trim() : "";
      if (!result) {
        reject(new Error("read_file_failed"));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
}

function safeUrlHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
}

export function usePictureTranslate(params: UsePictureTranslateParams) {
  const { locationSearch, toastShow, mode, onSuccess, initialHistory = [] } = params;
  const { t } = useTranslation();

  const [imageUrl, setImageUrl] = useState("");
  const [imageBase64, setImageBase64] = useState<string | undefined>(undefined);
  const [imageFileName, setImageFileName] = useState("");
  const [selectedSource, setSelectedSource] =
    useState<PictureTranslateImageSource>("upload");
  const [productKeyword, setProductKeyword] = useState("");
  const [submittedKeyword, setSubmittedKeyword] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchItem | null>(null);
  const [selectedImage, setSelectedImage] = useState<{
    url: string;
    altText: string | null;
  } | null>(null);
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [targetLanguage, setTargetLanguage] = useState("zh");
  const [formErrorText, setFormErrorText] = useState("");
  const [resultErrorText, setResultErrorText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [translatedImage, setTranslatedImage] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [resultMeta, setResultMeta] = useState<PictureTranslateResultMeta | null>(null);
  const [hasSubmittedOnce, setHasSubmittedOnce] = useState(false);
  const [history, setHistory] = useState<ShopVisualJobHistoryItem[]>(initialHistory);

  useEffect(() => {
    setHistory(initialHistory);
  }, [initialHistory]);

  const {
    items: productItems,
    isLoading: isProductSearching,
    errorText: productSearchError,
  } = useProductSearch({
    input: submittedKeyword,
    locationSearch,
    debounceMs: PRODUCT_SEARCH_DEBOUNCE_MS,
  });

  const sourceLanguageOptions = useMemo<PictureTranslateLanguageOption[]>(
    () =>
      filterPictureTranslateSourceLanguages(PICTURE_TRANSLATE_PROVIDER).map(
        (language) => ({
          value: language.code,
          label: t(language.i18nKey, { defaultValue: language.code }),
        }),
      ),
    [t],
  );

  const targetLanguageOptions = useMemo<PictureTranslateLanguageOption[]>(
    () =>
      filterPictureTranslateTargetLanguages({
        sourceLanguage,
        provider: PICTURE_TRANSLATE_PROVIDER,
      }).map((language) => ({
        value: language.code,
        label: t(language.i18nKey, { defaultValue: language.code }),
      })),
    [sourceLanguage, t],
  );

  useEffect(() => {
    console.info(
      `[PictureTranslateLanguage] provider=${PICTURE_TRANSLATE_PROVIDER ?? "auto-route"} source=${sourceLanguage} targetOptions=${JSON.stringify(
        targetLanguageOptions.map((option) => option.value),
      )}`,
    );
  }, [sourceLanguage, targetLanguageOptions]);

  useEffect(() => {
    if (targetLanguageOptions.length === 0) return;
    const stillValid = targetLanguageOptions.some(
      (option) => option.value === targetLanguage,
    );
    if (stillValid) return;

    const nextTarget = targetLanguageOptions[0].value;
    setTargetLanguage(nextTarget);
    console.info(
      `${LOG_PREFIX} target_language_updated source=${sourceLanguage} nextTarget=${nextTarget}`,
    );
  }, [sourceLanguage, targetLanguage, targetLanguageOptions]);

  const resolveImageSourceLabel = useCallback(
    (source: PictureTranslateImageSource) => {
      if (source === "upload") return t("pictureTranslate.imageSourceUpload");
      if (source === "url") return t("pictureTranslate.imageSourceUrl");
      return t("pictureTranslate.imageSourceProduct");
    },
    [t],
  );

  const resolveLanguageLabel = useCallback(
    (code: string, options: PictureTranslateLanguageOption[]) =>
      options.find((option) => option.value === code)?.label ?? code,
    [],
  );

  const resetResult = useCallback(() => {
    setTranslatedImage(null);
    setResultErrorText("");
    setRequestId(null);
    setResultMeta(null);
    setHasSubmittedOnce(false);
    console.info(`${LOG_PREFIX} reset_result mode=${mode}`);
  }, [mode]);

  const executeSearch = useCallback(() => {
    const trimmed = productKeyword.trim();
    setSubmittedKeyword(trimmed);
    setSelectedProduct(null);
    setSelectedImage(null);
    if (trimmed) {
      console.info(`[ProductSearch] keyword=${trimmed}`);
    }
  }, [productKeyword]);

  const handleProductSelect = useCallback(
    (product: ProductSearchItem) => {
      setSelectedProduct(product);
      setSelectedImage(null);
      console.info(
        `[ProductSelected] keyword=${submittedKeyword || productKeyword.trim()} productId=${product.id} imageCount=${product.images.length}`,
      );
    },
    [productKeyword, submittedKeyword],
  );

  const handleProductImageSelect = useCallback(
    (image: { url: string; altText: string | null }) => {
      setSelectedImage(image);
      setImageUrl(image.url);
      setImageBase64(undefined);
      setImageFileName("");
      setFormErrorText("");
      console.info(
        `[ProductImageSelected] productId=${selectedProduct?.id ?? ""} imageCount=${selectedProduct?.images.length ?? 0}`,
      );
    },
    [selectedProduct?.id, selectedProduct?.images.length],
  );

  const handleFileChange = useCallback(
    async (file: File) => {
      if (!/^image\/(png|jpeg|jpg)$/i.test(file.type)) {
        const message = t("pictureTranslate.validationInvalidFileType");
        setFormErrorText(message);
        toastShow(message);
        return;
      }

      try {
        const nextBase64 = await readFileAsDataUrl(file);
        setImageUrl("");
        setImageBase64(nextBase64);
        setImageFileName(file.name);
        setFormErrorText("");
        console.info(
          `[PictureTranslateForm] file selected name=${file.name} size=${file.size}`,
        );
      } catch {
        const message = t("pictureTranslate.readFileFailed");
        setFormErrorText(message);
        toastShow(message);
      }
    },
    [t, toastShow],
  );

  const submitTranslate = useCallback(async () => {
    if (isSubmitting) return;

    const trimmedUrl = imageUrl.trim();
    const isUploadSource = selectedSource === "upload";
    const isUrlSource = selectedSource === "url";
    const isProductSource = selectedSource === "product";
    const hasValidImage =
      (isUploadSource && Boolean(imageBase64)) ||
      ((isUrlSource || isProductSource) && Boolean(trimmedUrl));

    if (!hasValidImage) {
      const message = t("pictureTranslate.validationImageRequired");
      setFormErrorText(message);
      toastShow(message);
      console.info("[PictureTranslateSubmit] validation failed reason=image_required");
      return;
    }

    const payload = {
      imageUrl: trimmedUrl || undefined,
      imageBase64,
      sourceLanguage,
      targetLanguage,
    };
    const payloadSummary = {
      hasImageUrl: Boolean(payload.imageUrl),
      imageUrlHost: payload.imageUrl ? safeUrlHost(payload.imageUrl) : "",
      hasImageBase64: Boolean(payload.imageBase64),
      imageBase64Length: payload.imageBase64?.length ?? 0,
      sourceLanguage: payload.sourceLanguage,
      targetLanguage: payload.targetLanguage,
      selectedSource,
    };
    console.info(`[PictureTranslateSubmit] start ${JSON.stringify(payloadSummary)}`);

    setIsSubmitting(true);
    setFormErrorText("");
    setResultErrorText("");
    setHasSubmittedOnce(true);
    if (mode === "page") {
      setTranslatedImage(null);
    }

    const startedAt = Date.now();
    try {
      const response = await fetch(`/api/picture-translate-chat${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const raw = (await response.json().catch(() => ({}))) as PictureTranslateChatResponse;
      const success = raw.success === true;
      const nextTranslatedImage =
        typeof raw.translatedImage === "string" ? raw.translatedImage.trim() : "";
      const error =
        typeof raw.error === "string" && raw.error.trim()
          ? raw.error.trim()
          : t("pictureTranslate.submitFailed");
      const nextRequestId = typeof raw.requestId === "string" ? raw.requestId : "n/a";
      const durationMs = Date.now() - startedAt;
      setRequestId(nextRequestId);

      if (!response.ok || !success || !nextTranslatedImage) {
        const message = response.ok ? error : t("pictureTranslate.submitFailed");
        setResultErrorText(message);
        if (mode === "card") {
          setFormErrorText(message);
        }
        toastShow(message);
        console.info(
          `[PictureTranslateResult] success=false durationMs=${durationMs} requestId=${nextRequestId} error=${message}`,
        );
        return;
      }

      const meta: PictureTranslateResultMeta = {
        imageSource: selectedSource,
        imageSourceLabel: resolveImageSourceLabel(selectedSource),
        sourceLanguage,
        sourceLanguageLabel: resolveLanguageLabel(sourceLanguage, sourceLanguageOptions),
        targetLanguage,
        targetLanguageLabel: resolveLanguageLabel(targetLanguage, targetLanguageOptions),
        originalImageUrl:
          selectedSource === "upload" ? undefined : trimmedUrl || selectedImage?.url,
      };

      setTranslatedImage(nextTranslatedImage);
      setResultMeta(meta);
      setHistory((prev) => {
        const summary = `${sourceLanguage} → ${targetLanguage}`;
        const item: ShopVisualJobHistoryItem = {
          requestId: nextRequestId,
          kind: "picture_translate",
          summary,
          status: "succeeded",
          imageUrl: nextTranslatedImage,
          errorMsg: null,
          provider: null,
          createdAt: new Date().toISOString(),
        };
        return [item, ...prev.filter((h) => h.requestId !== nextRequestId)].slice(0, 12);
      });
      const successMessage = t("pictureTranslate.submitSuccess");
      console.info(
        `[PictureTranslateResult] success=true durationMs=${durationMs} requestId=${nextRequestId}`,
      );

      if (mode === "card" && onSuccess) {
        onSuccess({ translatedImage: nextTranslatedImage, message: successMessage });
      } else if (mode === "page") {
        toastShow(successMessage);
      }
    } catch {
      const durationMs = Date.now() - startedAt;
      const message = t("pictureTranslate.submitFailed");
      setResultErrorText(message);
      if (mode === "card") {
        setFormErrorText(message);
      }
      toastShow(message);
      console.info(
        `[PictureTranslateResult] success=false durationMs=${durationMs} requestId=n/a error=${message}`,
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    imageBase64,
    imageUrl,
    isSubmitting,
    locationSearch,
    mode,
    onSuccess,
    resolveImageSourceLabel,
    resolveLanguageLabel,
    selectedImage?.url,
    selectedSource,
    sourceLanguage,
    sourceLanguageOptions,
    t,
    targetLanguage,
    targetLanguageOptions,
    toastShow,
  ]);

  const displayFormError = mode === "card" ? formErrorText || resultErrorText : formErrorText;

  return {
    imageUrl,
    setImageUrl,
    imageBase64,
    setImageBase64,
    imageFileName,
    setImageFileName,
    selectedSource,
    setSelectedSource,
    productKeyword,
    setProductKeyword,
    submittedKeyword,
    selectedProduct,
    selectedImage,
    sourceLanguage,
    setSourceLanguage,
    targetLanguage,
    setTargetLanguage,
    sourceLanguageOptions,
    targetLanguageOptions,
    productItems,
    isProductSearching,
    productSearchError,
    formErrorText: displayFormError,
    resultErrorText,
    isSubmitting,
    translatedImage,
    requestId,
    resultMeta,
    hasSubmittedOnce,
    executeSearch,
    handleProductSelect,
    handleProductImageSelect,
    handleFileChange,
    submitTranslate,
    resetResult,
    history,
    selectHistoryItem: (item: ShopVisualJobHistoryItem) => {
      setRequestId(item.requestId);
      setHasSubmittedOnce(true);
      setResultErrorText("");
      if (item.status === "succeeded" && item.imageUrl) {
        setTranslatedImage(item.imageUrl);
        return;
      }
      if (item.status === "failed") {
        setTranslatedImage(null);
        setResultErrorText(item.errorMsg || t("pictureTranslate.submitFailed"));
      }
    },
  };
}

export type UsePictureTranslateReturn = ReturnType<typeof usePictureTranslate>;
