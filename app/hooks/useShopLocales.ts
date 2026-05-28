import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SHOP_LOCALES_FALLBACK,
  type ShopLocaleOption,
  type ShopLocalesApiResponse,
  type ShopLocalesPayload,
} from "../lib/productImproveLocales";
import {
  resolveInitialTargetLocales,
  resolveTranslationLocales,
} from "../lib/translationShopLocales";

const LOG_PREFIX = "[useShopLocales]";

export type LocaleSelectionMode = "single" | "multiple";

export type UseShopLocalesParams = {
  locationSearch: string;
  /** 独立页由 loader 注入；聊天卡片传 `null`，由 hook 请求 `/api/shop-locales`。 */
  initialShopLocales: ShopLocalesPayload | null;
  /** AI 预填或表单 coerce 的目标语言（单值） */
  initialTargetLocale?: string;
  /** AI 预填多个目标语言 */
  initialTargetLocales?: string[];
  selectionMode?: LocaleSelectionMode;
};

export function useShopLocales(params: UseShopLocalesParams) {
  const {
    locationSearch,
    initialShopLocales,
    initialTargetLocale,
    initialTargetLocales,
    selectionMode = "multiple",
  } = params;

  const [resolvedLocales, setResolvedLocales] = useState<ShopLocalesPayload | null>(
    initialShopLocales,
  );
  const [loading, setLoading] = useState(initialShopLocales == null);
  const initialTargetLocaleRef = useRef(initialTargetLocale);
  const initialTargetLocalesRef = useRef(initialTargetLocales);
  initialTargetLocaleRef.current = initialTargetLocale;
  initialTargetLocalesRef.current = initialTargetLocales;

  const [targetLocales, setTargetLocales] = useState<string[]>([]);

  const resolved = useMemo(() => {
    if (!resolvedLocales) {
      return {
        sourceLocale: "",
        sourceLabel: "",
        targetOptions: [] as ShopLocaleOption[],
      };
    }
    return resolveTranslationLocales(resolvedLocales);
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
            `${LOG_PREFIX} client fetch ok source=${payload.response.defaultTargetLanguage} fallback=${payload.response.isFallback}`,
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
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialShopLocales, locationSearch]);

  useEffect(() => {
    if (!resolvedLocales || resolved.targetOptions.length === 0) {
      return;
    }
    const defaults = resolveInitialTargetLocales(
      resolved.targetOptions,
      initialTargetLocaleRef.current,
      initialTargetLocalesRef.current,
    );
    setTargetLocales((prev) => {
      const validPrev = prev.filter((v) =>
        resolved.targetOptions.some((o) => o.value === v),
      );
      if (validPrev.length) {
        return validPrev;
      }
      return defaults;
    });
  }, [resolvedLocales, resolved.targetOptions]);

  const toggleTargetLocale = useCallback((locale: string) => {
    setTargetLocales((prev) => {
      if (selectionMode === "single") {
        return [locale];
      }
      if (prev.includes(locale)) {
        return prev.filter((x) => x !== locale);
      }
      return [...prev, locale];
    });
  }, [selectionMode]);

  const targetLocale = targetLocales[0] ?? "";

  const setTargetLocale = useCallback((locale: string) => {
    setTargetLocales(locale.trim() ? [locale.trim()] : []);
  }, []);

  const isFallback = resolvedLocales?.isFallback ?? false;

  return {
    sourceLocale: resolved.sourceLocale,
    sourceLabel: resolved.sourceLabel,
    targetOptions: resolved.targetOptions,
    targetLocale,
    setTargetLocale,
    targetLocales,
    setTargetLocales,
    toggleTargetLocale,
    loading,
    isFallback,
    selectionMode,
    localesReady: resolvedLocales != null && !loading,
  };
}
