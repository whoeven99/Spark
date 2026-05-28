import { useEffect, useMemo, useRef, useState } from "react";
import {
  SHOP_LOCALES_FALLBACK,
  type ShopLocaleOption,
  type ShopLocalesApiResponse,
  type ShopLocalesPayload,
} from "../lib/productImproveLocales";
import {
  resolveDefaultTargetLocale,
  resolveTranslationLocales,
} from "../lib/translationShopLocales";

const LOG_PREFIX = "[useShopLocales]";

export type LocaleSelectionMode = "single" | "multiple";

export type UseShopLocalesParams = {
  locationSearch: string;
  /** 独立页由 loader 注入；聊天卡片传 `null`，由 hook 请求 `/api/shop-locales`。 */
  initialShopLocales: ShopLocalesPayload | null;
  /** AI 预填或表单 coerce 的目标语言 */
  initialTargetLocale?: string;
};

export function useShopLocales(params: UseShopLocalesParams) {
  const { locationSearch, initialShopLocales, initialTargetLocale } = params;

  const [resolvedLocales, setResolvedLocales] = useState<ShopLocalesPayload | null>(
    initialShopLocales,
  );
  const [loading, setLoading] = useState(initialShopLocales == null);
  const initialTargetRef = useRef(initialTargetLocale);
  initialTargetRef.current = initialTargetLocale;

  const [targetLocale, setTargetLocale] = useState("");

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
    const next = resolveDefaultTargetLocale(
      resolved.targetOptions,
      initialTargetRef.current,
    );
    setTargetLocale((prev) => {
      if (prev && resolved.targetOptions.some((o) => o.value === prev)) {
        return prev;
      }
      return next;
    });
  }, [resolvedLocales, resolved.targetOptions]);

  const isFallback = resolvedLocales?.isFallback ?? false;
  const selectionMode: LocaleSelectionMode = "single";

  return {
    sourceLocale: resolved.sourceLocale,
    sourceLabel: resolved.sourceLabel,
    targetOptions: resolved.targetOptions,
    targetLocale,
    setTargetLocale,
    loading,
    isFallback,
    selectionMode,
    localesReady: resolvedLocales != null && !loading,
  };
}
