import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildCopyAllText } from "../lib/productImproveCopyText";
import type { GenerateDescriptionApiResponse } from "../lib/productImproveTypes";
import {
  SHOP_LOCALES_FALLBACK,
  type ShopLocalesApiResponse,
  type ShopLocalesPayload,
} from "../lib/productImproveLocales";
import type { ProductImproveCardPayload } from "../lib/chatMessage";
import type { UpdateProductDescriptionApiResponse } from "../lib/updateProductDescriptionTypes";

const LOG_PREFIX = "[useProductImprove]";

export type CopyTarget = "title" | "description" | "all";

export type UseProductImproveParams = {
  locationSearch: string;
  /** 独立页由 loader 注入；聊天卡片传 `null`，由 hook 请求 `/api/shop-locales`。 */
  initialShopLocales: ShopLocalesPayload | null;
  initialResult?: ProductImproveCardPayload;
  toastShow: (message: string) => void;
};

export function useProductImprove(params: UseProductImproveParams) {
  const { t } = useTranslation();
  const { locationSearch, initialShopLocales, initialResult, toastShow } = params;

  const [resolvedLocales, setResolvedLocales] = useState<ShopLocalesPayload | null>(
    initialShopLocales,
  );
  const [localesLoading, setLocalesLoading] = useState(initialShopLocales == null);
  const appliedDefaultRef = useRef(initialShopLocales != null);

  const [targetLanguage, setTargetLanguage] = useState(
    () => initialShopLocales?.defaultTargetLanguage ?? "",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [productTitle, setProductTitle] = useState<string | null>(
    initialResult?.title?.trim() || null,
  );
  const [description, setDescription] = useState<string | null>(
    initialResult?.description ?? null,
  );
  const [copyTarget, setCopyTarget] = useState<CopyTarget | null>(null);
  const [draftTitle, setDraftTitle] = useState(initialResult?.title ?? "");
  const [draftDescription, setDraftDescription] = useState(
    initialResult?.description ?? "",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveErrorText, setSaveErrorText] = useState<string | null>(null);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [pinnedProductId, setPinnedProductId] = useState(
    initialResult?.productId?.trim() ?? "",
  );

  useEffect(() => {
    setDraftTitle(productTitle ?? "");
  }, [productTitle]);

  useEffect(() => {
    setDraftDescription(description ?? "");
  }, [description]);

  useEffect(() => {
    if (resolvedLocales && !appliedDefaultRef.current) {
      appliedDefaultRef.current = true;
      setTargetLanguage(initialResult?.targetLanguage ?? resolvedLocales.defaultTargetLanguage);
    }
  }, [initialResult?.targetLanguage, resolvedLocales]);

  useEffect(() => {
    if (initialShopLocales != null) {
      return;
    }
    let cancelled = false;
    console.info(`${LOG_PREFIX} client fetch /api/shop-locales start`);
    void (async () => {
      try {
        const response = await fetch(`/api/shop-locales${locationSearch}`);
        const payload = (await response.json().catch(() => ({}))) as ShopLocalesApiResponse;
        if (cancelled) return;
        if (response.ok && payload.success && payload.response) {
          console.info(
            `${LOG_PREFIX} client fetch ok default=${payload.response.defaultTargetLanguage} fallback=${payload.response.isFallback}`,
          );
          setResolvedLocales(payload.response);
        } else {
          const msg =
            payload.success === false ? payload.errorMsg : `HTTP ${response.status}`;
          console.info(`${LOG_PREFIX} client fetch failed: ${msg}`);
          setResolvedLocales({ ...SHOP_LOCALES_FALLBACK });
        }
      } catch (e) {
        if (!cancelled) {
          console.info(`${LOG_PREFIX} client fetch exception`, e);
          setResolvedLocales({ ...SHOP_LOCALES_FALLBACK });
        }
      } finally {
        if (!cancelled) {
          setLocalesLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialShopLocales, locationSearch]);

  const localeOptions = resolvedLocales?.localeOptions ?? [];

  const resetResult = useCallback(() => {
    setProductTitle(null);
    setDescription(null);
    setErrorText(null);
    setSaveErrorText(null);
    setSaveConfirmOpen(false);
    setPinnedProductId("");
  }, []);

  const submitGenerate = useCallback(
    async (productIdRaw: string) => {
      const pid = productIdRaw.trim();
      const lang = targetLanguage.trim();
      if (!pid) {
        toastShow(t("generate.validationSelectProductId"));
        return;
      }
      if (!lang) {
        toastShow(t("generate.validationSelectTargetLanguage"));
        return;
      }
      if (localesLoading) {
        toastShow(t("generate.validationLocalesLoading"));
        return;
      }

      setIsSubmitting(true);
      setErrorText(null);
      setSaveErrorText(null);
      setSaveConfirmOpen(false);
      setProductTitle(null);
      setDescription(null);
      setPinnedProductId(pid);

      try {
        const response = await fetch(`/api/product-improve${locationSearch}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ productId: pid, targetLanguage: lang }),
        });
        const apiPayload = (await response.json().catch(() => ({}))) as GenerateDescriptionApiResponse;

        if (!response.ok || apiPayload.success === false) {
          const msg =
            apiPayload.success === false
              ? apiPayload.errorMsg
              : t("chat.requestFailed", { status: response.status });
          setErrorText(msg || t("chat.requestFailed", { status: response.status }));
          return;
        }

        if (
          apiPayload.success === true &&
          apiPayload.response &&
          typeof apiPayload.response.description === "string" &&
          typeof apiPayload.response.title === "string"
        ) {
          setProductTitle(apiPayload.response.title);
          setDescription(apiPayload.response.description);
          toastShow(t("generate.generateSuccess"));
        } else {
          setErrorText(t("chat.invalidReply"));
        }
      } catch {
        const msg = t("chat.sendFailed");
        setErrorText(msg);
        toastShow(msg);
      } finally {
        setIsSubmitting(false);
      }
    },
    [locationSearch, localesLoading, t, targetLanguage, toastShow],
  );

  const runCopy = useCallback(
    async (kind: CopyTarget) => {
      const title = draftTitle.trim();
      const desc = draftDescription;
      let text = "";
      if (kind === "title") {
        if (!title) {
          toastShow(t("generate.copyTitleEmpty"));
          return;
        }
        text = title;
      } else if (kind === "description") {
        if (!desc) {
          toastShow(t("generate.copyDescriptionEmpty"));
          return;
        }
        text = desc;
      } else {
        if (!title && !desc) {
          toastShow(t("generate.copyAllEmpty"));
          return;
        }
        text = buildCopyAllText(title, desc);
      }

      setCopyTarget(kind);
      try {
        await navigator.clipboard.writeText(text);
        toastShow(
          kind === "title"
            ? t("generate.copyTitleDone")
            : kind === "description"
              ? t("generate.copyDescriptionDone")
              : t("generate.copyAllDone"),
        );
        console.info(`${LOG_PREFIX} clipboard ok kind=${kind} chars=${text.length}`);
      } catch (e) {
        console.info(`${LOG_PREFIX} clipboard failed kind=${kind}`, e);
        toastShow(t("generate.copyFailed"));
      } finally {
        setCopyTarget(null);
      }
    },
    [draftDescription, draftTitle, t, toastShow],
  );

  const requestOpenSaveDialog = useCallback(() => {
    if (!draftTitle.trim()) {
      toastShow(t("generate.validationTitleRequired"));
      return;
    }
    if (!draftDescription.trim()) {
      toastShow(t("generate.validationDescriptionRequired"));
      return;
    }
    setSaveErrorText(null);
    setSaveConfirmOpen(true);
  }, [draftDescription, draftTitle, t, toastShow]);

  const cancelSaveDialog = useCallback(() => {
    if (!isSaving) {
      setSaveConfirmOpen(false);
    }
  }, [isSaving]);

  const confirmSaveToShopify = useCallback(
    async (productIdRaw: string) => {
      const pid = (productIdRaw.trim() || pinnedProductId).trim();
      if (!pid) {
        toastShow(t("generate.validationSelectProductId"));
        return;
      }
      const title = draftTitle.trim();
      const descPlain = draftDescription.trim();
      if (!title) {
        toastShow(t("generate.validationTitleRequired"));
        return;
      }
      if (!descPlain) {
        toastShow(t("generate.validationDescriptionRequired"));
        return;
      }

      setIsSaving(true);
      setSaveErrorText(null);
      console.info(
        `${LOG_PREFIX} save start productId=${pid} titleLen=${title.length} descLen=${descPlain.length}`,
      );

      try {
        const response = await fetch(
          `/api/update-product-description${locationSearch}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              productId: pid,
              title,
              descriptionPlain: descPlain,
            }),
          },
        );
        const apiPayload = (await response.json().catch(() => ({}))) as UpdateProductDescriptionApiResponse;

        if (!response.ok || apiPayload.success === false) {
          const msg =
            apiPayload.success === false
              ? apiPayload.errorMsg
              : t("chat.requestFailed", { status: response.status });
          setSaveErrorText(msg || t("chat.requestFailed", { status: response.status }));
          console.info(`${LOG_PREFIX} save failed: ${msg}`);
          return;
        }

        if (
          apiPayload.success === true &&
          apiPayload.response &&
          typeof apiPayload.response.title === "string"
        ) {
          setProductTitle(apiPayload.response.title);
          setSaveConfirmOpen(false);
          toastShow(t("generate.saveSuccess"));
          console.info(`${LOG_PREFIX} save ok id=${apiPayload.response.id}`);
        } else {
          setSaveErrorText(t("chat.invalidReply"));
        }
      } catch {
        const msg = t("chat.sendFailed");
        setSaveErrorText(msg);
        toastShow(msg);
        console.info(`${LOG_PREFIX} save network error`);
      } finally {
        setIsSaving(false);
      }
    },
    [draftDescription, draftTitle, locationSearch, pinnedProductId, t, toastShow],
  );

  return {
    targetLanguage,
    setTargetLanguage,
    localeOptions,
    localesLoading,
    localesIsFallback: resolvedLocales?.isFallback === true,
    isSubmitting,
    isSaving,
    errorText,
    saveErrorText,
    productTitle,
    description,
    pinnedProductId,
    draftTitle,
    setDraftTitle,
    draftDescription,
    setDraftDescription,
    copyTarget,
    saveConfirmOpen,
    requestOpenSaveDialog,
    cancelSaveDialog,
    confirmSaveToShopify,
    submitGenerate,
    copyTitle: () => {
      void runCopy("title");
    },
    copyDescription: () => {
      void runCopy("description");
    },
    copyAll: () => {
      void runCopy("all");
    },
    resetResult,
  };
}
