/**
 * 商品页质量评分聊天卡：工作台商品选择器（单选）+ 评分结果。
 * 选品交互对齐 TaskProposalCard（打开底部「商品」弹窗），评分仅针对一个商品。
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import {
  useProductQualityScore,
  type ProductQualityScoreResult as QualityScoreResult,
} from "../../../hooks/useProductQualityScore";
import type { BatchTaskProduct } from "../../../lib/batchTasksFormPayload";
import {
  productQualityFormHasScore,
  type ProductQualityFormPayload,
} from "../../../lib/productQualityFormPayload";
import { ProductQualityScoreResult } from "../productImprove/ProductQualityScoreResult";
import { pageColorTokens } from "../../page/pageUiStyles";

type Props = {
  embedded?: boolean;
  initialPayload?: ProductQualityFormPayload;
  /** 工作台已选商品；用于补全 / 更换后同步 */
  contextProducts?: BatchTaskProduct[];
  /** 打开与底部「添加上下文 → 商品」相同的选择弹窗 */
  onOpenProductPicker?: () => void;
};

type SelectedProduct = {
  id: string;
  title: string;
  imageUrl?: string | null;
};

function selectionFromPayload(
  payload: ProductQualityFormPayload | undefined,
): SelectedProduct | null {
  const id = payload?.productId?.trim();
  if (!id) return null;
  return {
    id,
    title: payload?.title?.trim() || id,
    imageUrl: null,
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

function pickSingleProduct(
  products: BatchTaskProduct[],
  preferredId?: string | null,
): SelectedProduct | null {
  if (products.length === 0) return null;
  const preferred = preferredId?.trim();
  const match = preferred
    ? products.find((product) => product.id === preferred)
    : undefined;
  const chosen = match ?? products[0]!;
  return {
    id: chosen.id,
    title: chosen.title,
    imageUrl: chosen.imageUrl,
  };
}

const setupPanelStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: 10,
  background: pageColorTokens.surfaceSubtle,
  overflow: "hidden",
};

const setupRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "12px 12px",
};

const setupLabelStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
};

const setupStepStyle: CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: 999,
  background: pageColorTokens.brandGreenLight,
  color: pageColorTokens.brandGreenDeep,
  fontSize: 11,
  fontWeight: 700,
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
};

const setupTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const setupHintStyle: CSSProperties = {
  fontSize: 12,
  color: pageColorTokens.textFootnote,
  marginTop: 3,
  marginLeft: 26,
};

const pickProductButtonStyle = (disabled: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 13px",
  borderRadius: 999,
  border: `1px solid rgba(0, 128, 96, ${disabled ? 0.16 : 0.32})`,
  background: pageColorTokens.brandGreenLight,
  color: pageColorTokens.brandGreenDeep,
  fontSize: 13,
  fontWeight: 700,
  whiteSpace: "nowrap",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.55 : 1,
  flexShrink: 0,
});

const changeProductLinkStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: pageColorTokens.brandGreenDeep,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  padding: 0,
  flexShrink: 0,
};

const thumbStyle: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  objectFit: "cover",
  background: pageColorTokens.surfaceMuted,
  flexShrink: 0,
};

const thumbPlaceholderStyle: CSSProperties = {
  ...thumbStyle,
  display: "grid",
  placeItems: "center",
  fontSize: 10,
  fontWeight: 700,
  color: pageColorTokens.textFootnote,
};

export function ProductQualityScoreChatCard({
  embedded = false,
  initialPayload,
  contextProducts = [],
  onOpenProductPicker,
}: Props) {
  const shopify = useAppBridge();
  const { t, i18n } = useTranslation();
  /**
   * 点了「选择/更换商品」后跟随工作台当前选品（单选：取第一个，或保留仍在列表中的原商品）。
   */
  const [followContextProduct, setFollowContextProduct] = useState(
    () => !selectionFromPayload(initialPayload),
  );
  const [selectedProduct, setSelectedProduct] = useState<SelectedProduct | null>(() => {
    const fromPayload = selectionFromPayload(initialPayload);
    if (fromPayload) return fromPayload;
    return pickSingleProduct(contextProducts);
  });
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

  useEffect(() => {
    if (!followContextProduct) return;
    const next = pickSingleProduct(contextProducts, selectedProduct?.id);
    setSelectedProduct(next);
    // 仅在上下文变化时同步；不把 selectedProduct 放进 deps，避免循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextProducts, followContextProduct]);

  const openProductPicker = useCallback(() => {
    setFollowContextProduct(true);
    resetScore();
    setDisplayResult(null);
    onOpenProductPicker?.();
  }, [onOpenProductPicker, resetScore]);

  const productId = (selectedProduct?.id ?? "").trim();
  const selectedTitle = (
    selectedProduct?.title ||
    displayResult?.title ||
    initialPayload?.title ||
    ""
  ).trim();
  const billedTokens = displayResult?.billedTokens ?? 0;
  const extraContextCount = useMemo(() => {
    if (contextProducts.length <= 1) return 0;
    return contextProducts.length - 1;
  }, [contextProducts.length]);

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
              {selectedTitle && displayResult ? ` · ${selectedTitle}` : ""}
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
            <div style={{ ...setupPanelStyle, marginBottom: "0.85rem" }}>
              {selectedProduct ? (
                <div style={{ padding: "12px 12px 10px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      marginBottom: 8,
                    }}
                  >
                    <div style={setupLabelStyle}>
                      <span style={setupStepStyle} aria-hidden="true">
                        1
                      </span>
                      <span style={setupTitleStyle}>
                        {t("qualityScore.selectedProduct")}
                      </span>
                    </div>
                    {onOpenProductPicker ? (
                      <button
                        type="button"
                        style={changeProductLinkStyle}
                        onClick={openProductPicker}
                      >
                        {t("qualityScore.changeProduct")}
                      </button>
                    ) : null}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${pageColorTokens.borderSubtle}`,
                      background: "#fff",
                    }}
                  >
                    {selectedProduct.imageUrl ? (
                      <img src={selectedProduct.imageUrl} alt="" style={thumbStyle} />
                    ) : (
                      <div style={thumbPlaceholderStyle}>
                        {t("workspace.shell.contextPicker.thumbProduct")}
                      </div>
                    )}
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 13,
                        fontWeight: 600,
                        color: pageColorTokens.textPrimary,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {selectedProduct.title}
                    </span>
                  </div>
                  {extraContextCount > 0 ? (
                    <div style={{ ...setupHintStyle, marginLeft: 0, marginTop: 8 }}>
                      {t("qualityScore.singleSelectHint", { count: extraContextCount + 1 })}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div style={setupRowStyle}>
                  <div style={{ minWidth: 0 }}>
                    <div style={setupLabelStyle}>
                      <span style={setupStepStyle} aria-hidden="true">
                        1
                      </span>
                      <span style={setupTitleStyle}>{t("qualityScore.pickProduct")}</span>
                    </div>
                    <div style={setupHintStyle}>{t("qualityScore.pickProductHint")}</div>
                  </div>
                  <button
                    type="button"
                    style={pickProductButtonStyle(!onOpenProductPicker)}
                    onClick={openProductPicker}
                    disabled={!onOpenProductPicker}
                  >
                    <span aria-hidden="true">◫</span>
                    {t("qualityScore.pickProductButton")}
                  </button>
                </div>
              )}
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
                  onClick={openProductPicker}
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
