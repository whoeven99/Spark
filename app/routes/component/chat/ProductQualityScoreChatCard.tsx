import { useState, type CSSProperties } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import {
  useProductQualityScore,
  type ProductQualityScoreResult as QualityScoreResult,
} from "../../../hooks/useProductQualityScore";
import {
  productQualityFormHasScore,
  type ProductQualityFormPayload,
} from "../../../lib/productQualityFormPayload";
import type { ProductSelectorSelection } from "../../../lib/productSearchTypes";
import { ProductSelector } from "../product/ProductSelector";
import { ProductQualityScoreResult } from "../productImprove/ProductQualityScoreResult";
import { pageColorTokens } from "../../page/pageUiStyles";

type Props = {
  embedded?: boolean;
  initialPayload?: ProductQualityFormPayload;
};

function selectionFromPayload(
  payload: ProductQualityFormPayload | undefined,
): ProductSelectorSelection | null {
  const id = payload?.productId?.trim();
  if (!id) return null;
  return {
    id,
    title: payload?.title?.trim() || id,
    featuredImageUrl: null,
    images: [],
  };
}

function resultFromPayload(
  payload: ProductQualityFormPayload | undefined,
): QualityScoreResult | null {
  if (!payload || !productQualityFormHasScore(payload)) return null;
  return {
    productId: payload.productId,
    title: payload.title ?? "",
    score: payload.score as number,
    dimensions: payload.dimensions as QualityScoreResult["dimensions"],
    overallSuggestions: payload.overallSuggestions ?? [],
    ...(payload.billedTokens != null ? { billedTokens: payload.billedTokens } : {}),
  };
}

export function ProductQualityScoreChatCard({
  embedded = false,
  initialPayload,
}: Props) {
  const shopify = useAppBridge();
  const { t, i18n } = useTranslation();
  const [selectedProduct, setSelectedProduct] = useState<ProductSelectorSelection | null>(
    () => selectionFromPayload(initialPayload),
  );
  const [displayResult, setDisplayResult] = useState<QualityScoreResult | null>(() =>
    resultFromPayload(initialPayload),
  );

  const search = typeof window !== "undefined" ? window.location.search : "";

  const { isScoring, scoreError, submitScore, resetScore } = useProductQualityScore({
    locationSearch: search,
    toastShow: (message: string) => {
      shopify.toast.show(message);
    },
  });

  const productId = (selectedProduct?.id ?? initialPayload?.productId ?? "").trim();
  const selectedTitle = (selectedProduct?.title || displayResult?.title || initialPayload?.title || "").trim();
  const billedTokens = displayResult?.billedTokens ?? 0;

  const handleScore = async () => {
    const outcome = await submitScore(productId);
    if (outcome.ok) {
      setDisplayResult(outcome.result);
    }
  };

  const handleRescore = async () => {
    resetScore();
    const outcome = await submitScore(productId);
    if (outcome.ok) {
      setDisplayResult(outcome.result);
    } else {
      setDisplayResult(null);
    }
  };

  const handleChangeProduct = () => {
    resetScore();
    setDisplayResult(null);
  };

  const shellStyle: CSSProperties = {
    marginTop: embedded ? 0 : "0.5rem",
    borderRadius: embedded ? "14px" : "16px",
    padding: "1px",
    background:
      "linear-gradient(135deg, rgba(44, 110, 203, 0.38) 0%, rgba(0, 128, 96, 0.28) 50%, rgba(147, 112, 219, 0.22) 100%)",
    boxShadow: embedded
      ? "0 2px 12px rgba(0, 0, 0, 0.05)"
      : "0 4px 24px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)",
  };

  const innerStyle: CSSProperties = {
    borderRadius: embedded ? "13px" : "15px",
    background: "linear-gradient(180deg, #ffffff 0%, #fafbfb 100%)",
    overflow: "hidden",
  };

  const showForm = !displayResult && !isScoring;

  return (
    <div style={shellStyle}>
      <div style={innerStyle}>
        <div
          style={{
            padding: embedded ? "0.85rem 1rem 1rem" : "1rem 1.125rem 1.125rem",
          }}
        >
          <div style={{ marginBottom: "0.75rem" }}>
            <div
              style={{
                fontSize: embedded ? "1rem" : "1.0625rem",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "#111213",
              }}
            >
              {t("qualityScore.sectionTitle")}
              {selectedTitle ? ` · ${selectedTitle}` : ""}
            </div>
            {showForm ? (
              <div
                style={{
                  marginTop: "0.35rem",
                  fontSize: "0.8125rem",
                  color: "#6d7175",
                  lineHeight: 1.45,
                }}
              >
                {t("qualityScore.intro")}
              </div>
            ) : null}
          </div>

          {showForm ? (
            <div style={{ marginBottom: "0.85rem" }}>
              <ProductSelector
                locationSearch={search}
                embedded={embedded}
                selected={selectedProduct}
                onSelectedChange={setSelectedProduct}
              />
            </div>
          ) : null}

          {isScoring || scoreError || displayResult ? (
            <div style={{ marginBottom: displayResult || scoreError ? "0.85rem" : 0 }}>
              <ProductQualityScoreResult
                result={displayResult}
                isScoring={isScoring}
                errorText={scoreError}
              />
            </div>
          ) : null}

          {displayResult && billedTokens > 0 ? (
            <div
              style={{
                marginBottom: "0.85rem",
                fontSize: "0.8125rem",
                color: pageColorTokens.textSecondary,
              }}
            >
              {t("qualityScore.creditsUsed", {
                count: billedTokens.toLocaleString(i18n.language),
              })}
            </div>
          ) : null}

          <s-stack direction="block" gap="small">
            {showForm ? (
              <s-button
                type="button"
                variant="primary"
                onClick={() => {
                  void handleScore();
                }}
                {...(isScoring || !productId ? { disabled: true } : {})}
              >
                {t("qualityScore.startAction")}
              </s-button>
            ) : null}
            {displayResult && !isScoring ? (
              <>
                <s-button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    void handleRescore();
                  }}
                >
                  {t("qualityScore.rescoreAction")}
                </s-button>
                <s-button
                  type="button"
                  variant="tertiary"
                  onClick={handleChangeProduct}
                >
                  {t("qualityScore.changeProduct")}
                </s-button>
              </>
            ) : null}
          </s-stack>
        </div>
      </div>
    </div>
  );
}
