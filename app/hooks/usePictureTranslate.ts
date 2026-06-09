import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  filterPictureTranslateSourceLanguages,
  filterPictureTranslateTargetLanguages,
  selectModelTypeForLanguagePair,
  type PictureTranslateProvider,
} from "../config/pictureTranslateLanguages";
import type { PictureTranslateFormPayload } from "../lib/pictureTranslateFormPayload";
import type {
  PictureTranslateImageSource,
  PictureTranslateLanguageOption,
} from "../lib/pictureTranslateTypes";
import type { ProductSearchItem } from "../lib/productSearchTypes";
import { useProductSearch } from "./useProductSearch";
import type { AITaskCreateResponse, AITaskType } from "../lib/aiTaskTypes";

const LOG_PREFIX = "[usePictureTranslate]";
const PICTURE_TRANSLATE_PROVIDER: PictureTranslateProvider | null = null;
const PRODUCT_SEARCH_DEBOUNCE_MS = 300;

export type UsePictureTranslateParams = {
  locationSearch: string;
  toastShow: (message: string) => void;
  mode: "page" | "card";
  initialFormPayload?: PictureTranslateFormPayload;
  onTaskCreated?: (
    taskId: string,
    batchId: string,
    taskType: AITaskType,
    optimisticConfig?: Record<string, unknown>,
  ) => void;
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
  const { locationSearch, toastShow, onTaskCreated, initialFormPayload } = params;
  const { t } = useTranslation();

  const prefilledImageUrl = initialFormPayload?.imageUrl?.trim() ?? "";
  const [imageUrl, setImageUrl] = useState(prefilledImageUrl);
  const [imageBase64, setImageBase64] = useState<string | undefined>(undefined);
  const [imageFileName, setImageFileName] = useState("");
  const [selectedSource, setSelectedSource] =
    useState<PictureTranslateImageSource>(prefilledImageUrl ? "url" : "upload");
  const [productKeyword, setProductKeyword] = useState("");
  const [submittedKeyword, setSubmittedKeyword] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchItem | null>(null);
  const [selectedImage, setSelectedImage] = useState<{
    url: string;
    altText: string | null;
  } | null>(null);
  const [sourceLanguage, setSourceLanguage] = useState(
    initialFormPayload?.sourceLanguage?.trim() || "auto",
  );
  const [targetLanguage, setTargetLanguage] = useState(
    initialFormPayload?.targetLanguage?.trim() || "zh",
  );
  const [formErrorText, setFormErrorText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const prepareSubmit = useCallback(() => {
    const trimmedUrl = imageUrl.trim();
    const isUploadSource = selectedSource === "upload";
    const isUrlSource = selectedSource === "url";
    const isProductSource = selectedSource === "product";

    if (isUploadSource) {
      const message = t("imageStudio.uploadNotSupportedYet");
      setFormErrorText(message);
      toastShow(message);
      return null;
    }

    const hasValidImage = ((isUrlSource || isProductSource) && Boolean(trimmedUrl));
    if (!hasValidImage) {
      const message = t("pictureTranslate.validationImageRequired");
      setFormErrorText(message);
      toastShow(message);
      console.info("[PictureTranslateSubmit] validation failed reason=image_required");
      return null;
    }

    return {
      imageUrl: trimmedUrl,
      sourceCode: sourceLanguage,
      targetCode: targetLanguage,
      sourceType: selectedSource,
      productTitle: selectedProduct?.title ?? "",
    };
  }, [
    imageUrl,
    selectedProduct?.title,
    selectedSource,
    sourceLanguage,
    t,
    targetLanguage,
    toastShow,
  ]);

  const submitTranslate = useCallback(async () => {
    if (isSubmitting) return;
    const prepared = prepareSubmit();
    if (!prepared) return;
    const trimmedUrl = prepared.imageUrl;

    const payloadSummary = {
      hasImageUrl: Boolean(trimmedUrl),
      imageUrlHost: trimmedUrl ? safeUrlHost(trimmedUrl) : "",
      hasImageBase64: Boolean(imageBase64),
      sourceLanguage,
      targetLanguage,
      selectedSource,
    };
    console.info(`[PictureTranslateSubmit] start ${JSON.stringify(payloadSummary)}`);

    setIsSubmitting(true);
    setFormErrorText("");

    try {
      const modelType = selectModelTypeForLanguagePair(sourceLanguage, targetLanguage);
      const body: Record<string, unknown> = {
        imageUrl: trimmedUrl || undefined,
        sourceCode: sourceLanguage,
        targetCode: targetLanguage,
        modelType,
      };

      const response = await fetch(`/api/picture-translate${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const raw = (await response.json().catch(() => ({}))) as AITaskCreateResponse;

      if (!raw.success) {
        const message = raw.errorMsg || t("pictureTranslate.submitFailed");
        setFormErrorText(message);
        toastShow(message);
        return;
      }

      console.info(
        `${LOG_PREFIX} task created taskId=${raw.taskId} batchId=${raw.batchId}`,
      );
      toastShow(t("pictureTranslate.submitSuccess"));
      onTaskCreated?.(raw.taskId, raw.batchId, "picture_translate", {
        imageUrl: trimmedUrl || undefined,
        sourceCode: prepared.sourceCode,
        targetCode: prepared.targetCode,
        modelType: 1,
        sourceType: prepared.sourceType,
        productTitle: prepared.productTitle,
      });
    } catch {
      const message = t("pictureTranslate.submitFailed");
      setFormErrorText(message);
      toastShow(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting,
    locationSearch,
    onTaskCreated,
    imageBase64,
    selectedSource,
    prepareSubmit,
    t,
    toastShow,
  ]);

  const displayFormError = formErrorText;

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
    isSubmitting,
    prepareSubmit,
    executeSearch,
    handleProductSelect,
    handleProductImageSelect,
    handleFileChange,
    submitTranslate,
  };
}

export type UsePictureTranslateReturn = ReturnType<typeof usePictureTranslate>;
