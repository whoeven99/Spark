import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  ProductQualityScoreApiResponse,
  ProductQualityScoreData,
} from "../lib/productQualityScoreTypes";

const LOG_PREFIX = "[useProductQualityScore]";

export type ProductQualityScoreResult = {
  productId: string;
  title: string;
} & ProductQualityScoreData;

export type SubmitScoreOutcome =
  | {
      ok: true;
      result: ProductQualityScoreResult;
    }
  | {
      ok: false;
      errorText: string;
    };

export function useProductQualityScore(params: {
  locationSearch: string;
  toastShow: (message: string) => void;
}) {
  const { t } = useTranslation();
  const { locationSearch, toastShow } = params;

  const [isScoring, setIsScoring] = useState(false);
  const [scoreResult, setScoreResult] = useState<ProductQualityScoreResult | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);

  const submitScore = useCallback(
    async (productIdRaw: string) => {
      const pid = productIdRaw.trim();
      if (!pid) {
        toastShow(t("generate.validationSelectProductId"));
        return {
          ok: false,
          errorText: t("generate.validationSelectProductId"),
        } satisfies SubmitScoreOutcome;
      }

      setIsScoring(true);
      setScoreError(null);
      setScoreResult(null);

      try {
        const response = await fetch(`/api/product-quality-score${locationSearch}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ productId: pid }),
        });
        const payload = (await response.json().catch(() => ({}))) as ProductQualityScoreApiResponse;

        if (!response.ok || payload.success === false) {
          const msg =
            payload.success === false
              ? payload.errorMsg
              : t("chat.requestFailed", { status: response.status });
          setScoreError(msg || t("chat.requestFailed", { status: response.status }));
          console.info(`${LOG_PREFIX} score failed: ${msg}`);
          return {
            ok: false,
            errorText: msg || t("chat.requestFailed", { status: response.status }),
          } satisfies SubmitScoreOutcome;
        }

        if (payload.success === true && payload.response) {
          setScoreResult(payload.response);
          toastShow(t("qualityScore.scoreSuccess"));
          return {
            ok: true,
            result: payload.response,
          } satisfies SubmitScoreOutcome;
        } else {
          setScoreError(t("chat.invalidReply"));
          return {
            ok: false,
            errorText: t("chat.invalidReply"),
          } satisfies SubmitScoreOutcome;
        }
      } catch {
        const msg = t("chat.sendFailed");
        setScoreError(msg);
        toastShow(msg);
        return {
          ok: false,
          errorText: msg,
        } satisfies SubmitScoreOutcome;
      } finally {
        setIsScoring(false);
      }
    },
    [locationSearch, t, toastShow],
  );

  const resetScore = useCallback(() => {
    setScoreResult(null);
    setScoreError(null);
  }, []);

  return { isScoring, scoreResult, scoreError, submitScore, resetScore };
}
