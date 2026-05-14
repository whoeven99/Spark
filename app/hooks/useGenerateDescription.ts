import { useCallback, useEffect, useRef, useState } from "react";
import { buildCopyAllText } from "../lib/generateDescriptionCopyText";
import type { GenerateDescriptionApiResponse } from "../lib/generateDescriptionTypes";
import {
  SHOP_LOCALES_FALLBACK,
  type ShopLocalesApiResponse,
  type ShopLocalesPayload,
} from "../lib/generateDescriptionLocales";

const LOG_PREFIX = "[useGenerateDescription]";

export type CopyTarget = "title" | "description" | "all";

export type UseGenerateDescriptionParams = {
  locationSearch: string;
  /** 独立页由 loader 注入；聊天卡片传 `null`，由 hook 请求 `/api/shop-locales`。 */
  initialShopLocales: ShopLocalesPayload | null;
  toastShow: (message: string) => void;
};

export function useGenerateDescription(params: UseGenerateDescriptionParams) {
  const { locationSearch, initialShopLocales, toastShow } = params;

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
  const [productTitle, setProductTitle] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [copyTarget, setCopyTarget] = useState<CopyTarget | null>(null);

  useEffect(() => {
    if (resolvedLocales && !appliedDefaultRef.current) {
      appliedDefaultRef.current = true;
      setTargetLanguage(resolvedLocales.defaultTargetLanguage);
    }
  }, [resolvedLocales]);

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
  }, []);

  const submitGenerate = useCallback(
    async (productIdRaw: string) => {
      const pid = productIdRaw.trim();
      const lang = targetLanguage.trim();
      if (!pid) {
        toastShow("请选择商品或填写商品 ID");
        return;
      }
      if (!lang) {
        toastShow("请选择目标语言");
        return;
      }
      if (localesLoading) {
        toastShow("语言列表加载中，请稍候");
        return;
      }

      setIsSubmitting(true);
      setErrorText(null);
      setProductTitle(null);
      setDescription(null);

      try {
        const response = await fetch(`/api/generate-description${locationSearch}`, {
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
              : `请求失败（${response.status}）`;
          setErrorText(msg || `请求失败（${response.status}）`);
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
          toastShow("描述生成成功");
        } else {
          setErrorText("返回数据异常，请重试");
        }
      } catch {
        const msg = "网络异常，请稍后重试";
        setErrorText(msg);
        toastShow(msg);
      } finally {
        setIsSubmitting(false);
      }
    },
    [locationSearch, localesLoading, targetLanguage, toastShow],
  );

  const runCopy = useCallback(
    async (kind: CopyTarget) => {
      const title = (productTitle ?? "").trim();
      const desc = description ?? "";
      let text = "";
      if (kind === "title") {
        if (!title) {
          toastShow("暂无可复制的标题");
          return;
        }
        text = title;
      } else if (kind === "description") {
        if (!desc) {
          toastShow("暂无可复制的描述");
          return;
        }
        text = desc;
      } else {
        if (!title && !desc) {
          toastShow("暂无可复制内容");
          return;
        }
        text = buildCopyAllText(title || "Unknown Product", desc);
      }

      setCopyTarget(kind);
      try {
        await navigator.clipboard.writeText(text);
        toastShow(
          kind === "title"
            ? "标题已复制"
            : kind === "description"
              ? "描述已复制"
              : "标题与描述已复制",
        );
        console.info(`${LOG_PREFIX} clipboard ok kind=${kind} chars=${text.length}`);
      } catch (e) {
        console.info(`${LOG_PREFIX} clipboard failed kind=${kind}`, e);
        toastShow("复制失败，请检查浏览器权限或手动选择文本复制");
      } finally {
        setCopyTarget(null);
      }
    },
    [description, productTitle, toastShow],
  );

  return {
    targetLanguage,
    setTargetLanguage,
    localeOptions,
    localesLoading,
    localesIsFallback: resolvedLocales?.isFallback === true,
    isSubmitting,
    errorText,
    productTitle,
    description,
    copyTarget,
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
