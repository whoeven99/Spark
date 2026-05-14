import { useState, type CSSProperties } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useGenerateDescription } from "../../../hooks/useGenerateDescription";
import type { ProductSelectorSelection } from "../../../lib/productSearchTypes";
import { ProductSelector } from "../product/ProductSelector";

type Props = {
  /** 嵌在助手气泡内时略收紧边距与阴影 */
  embedded?: boolean;
};

export function GenerateDescriptionChatCard({ embedded = false }: Props) {
  const shopify = useAppBridge();
  const [selectedProduct, setSelectedProduct] =
    useState<ProductSelectorSelection | null>(null);
  const [productId, setProductId] = useState("");
  const [showManualProductId, setShowManualProductId] = useState(false);

  const search = typeof window !== "undefined" ? window.location.search : "";

  const {
    targetLanguage,
    setTargetLanguage,
    localeOptions,
    localesLoading,
    isSubmitting,
    errorText,
    productTitle,
    description,
    copyTarget,
    submitGenerate,
    copyTitle,
    copyDescription,
    copyAll,
    localesIsFallback,
  } = useGenerateDescription({
    locationSearch: search,
    initialShopLocales: null,
    toastShow: (message: string) => {
      shopify.toast.show(message);
    },
  });

  const handleGenerate = async () => {
    const pid = (selectedProduct?.id ?? productId).trim();
    await submitGenerate(pid);
  };

  const copyBusy = copyTarget !== null;

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

  const fieldGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "0.75rem",
  };

  const primaryBtnStyle: CSSProperties = {
    width: "100%",
    marginTop: "0.25rem",
  };

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
              商品描述生成
            </div>
            <div
              style={{
                marginTop: "0.35rem",
                fontSize: "0.8125rem",
                color: "#6d7175",
                lineHeight: 1.45,
              }}
            >
              基于当前店铺在 Shopify 中的商品数据生成营销描述。请搜索并选择商品；语言默认与店铺主语言一致，可在下拉中切换。
            </div>
          </div>

          <div style={{ marginBottom: "0.85rem" }}>
            <ProductSelector
              locationSearch={search}
              embedded={embedded}
              selected={selectedProduct}
              onSelectedChange={setSelectedProduct}
            />
            <details
              style={{ marginTop: "0.35rem" }}
              open={showManualProductId}
              onToggle={(e) =>
                setShowManualProductId(e.currentTarget.open)
              }
            >
              <summary
                style={{
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  color: "#2c6ecb",
                  userSelect: "none",
                }}
              >
                高级：手动输入商品 ID
              </summary>
              <div style={{ marginTop: "0.5rem" }}>
                <s-text-field
                  label="商品 ID"
                  value={productId}
                  onChange={(e) => setProductId(e.currentTarget.value)}
                  autocomplete="off"
                />
              </div>
            </details>
          </div>

          <div style={{ ...fieldGridStyle, marginBottom: "0.85rem" }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label
                htmlFor="generate-description-lang-card"
                style={{
                  display: "block",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "#444",
                }}
              >
                目标语言
              </label>
              <select
                id="generate-description-lang-card"
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                disabled={localesLoading || isSubmitting}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "0.35rem",
                  padding: "0.45rem 0.55rem",
                  fontSize: "0.8125rem",
                  borderRadius: "8px",
                  border: "1px solid #c9cccf",
                  background: localesLoading ? "#f6f6f7" : "#fff",
                  color: "#303030",
                  boxSizing: "border-box",
                }}
              >
                {localesLoading && localeOptions.length === 0 ? (
                  <option value="">加载语言列表…</option>
                ) : null}
                {localeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {localesIsFallback ? (
                <div
                  style={{
                    marginTop: "0.3rem",
                    fontSize: "0.6875rem",
                    color: "#6d7175",
                    lineHeight: 1.4,
                  }}
                >
                  使用内置语言列表；授权 read_locales 并重新安装后可同步店铺语言。
                </div>
              ) : null}
            </div>
          </div>

          {errorText ? (
            <div
              style={{
                marginBottom: "0.75rem",
                padding: "0.5rem 0.65rem",
                borderRadius: "8px",
                background: "rgba(216, 44, 13, 0.08)",
                color: "#8a2712",
                fontSize: "0.8125rem",
                lineHeight: 1.45,
              }}
            >
              {errorText}
            </div>
          ) : null}

          {description ? (
            <div style={{ marginBottom: "0.85rem" }}>
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "#444",
                  marginBottom: "0.35rem",
                }}
              >
                生成结果
              </div>
              <div
                style={{
                  padding: "0.65rem 0.75rem",
                  borderRadius: "10px",
                  background: "rgba(44, 110, 203, 0.06)",
                  border: "1px solid rgba(44, 110, 203, 0.2)",
                }}
              >
                <div
                  style={{
                    fontSize: "0.8125rem",
                    color: "#303030",
                    lineHeight: 1.5,
                    marginBottom: "0.5rem",
                  }}
                >
                  商品名：
                  {productTitle?.trim() ? productTitle : "Unknown Product"}
                </div>
                <div
                  style={{
                    fontSize: "0.8125rem",
                    color: "#303030",
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.5,
                  }}
                >
                  {description}
                </div>
              </div>
              <s-stack direction="inline" gap="small">
                <s-button
                  type="button"
                  variant="secondary"
                  onClick={copyTitle}
                  {...(isSubmitting || copyBusy ? { disabled: true } : {})}
                >
                  {copyTarget === "title" ? "复制中…" : "复制标题"}
                </s-button>
                <s-button
                  type="button"
                  variant="secondary"
                  onClick={copyDescription}
                  {...(isSubmitting || copyBusy ? { disabled: true } : {})}
                >
                  {copyTarget === "description" ? "复制中…" : "复制描述"}
                </s-button>
                <s-button
                  type="button"
                  variant="secondary"
                  onClick={copyAll}
                  {...(isSubmitting || copyBusy ? { disabled: true } : {})}
                >
                  {copyTarget === "all" ? "复制中…" : "复制全部"}
                </s-button>
              </s-stack>
            </div>
          ) : null}

          <s-stack direction="block" gap="small">
            <div style={primaryBtnStyle}>
              <s-button
                type="button"
                variant="primary"
                onClick={() => {
                  void handleGenerate();
                }}
                {...(isSubmitting || localesLoading ? { disabled: true } : {})}
              >
                {isSubmitting
                  ? "正在生成…"
                  : localesLoading
                    ? "加载语言…"
                    : "生成描述"}
              </s-button>
            </div>
          </s-stack>
        </div>
      </div>
    </div>
  );
}
