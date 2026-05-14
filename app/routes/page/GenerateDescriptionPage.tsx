import { useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useLoaderData } from "react-router";
import { useGenerateDescription } from "../../hooks/useGenerateDescription";
import type { loader } from "../app.generate-description";
import type { ProductSelectorSelection } from "../../lib/productSearchTypes";
import { ProductSelector } from "../component/product/ProductSelector";

export function GenerateDescriptionPage() {
  const shopify = useAppBridge();
  const loaderData = useLoaderData<typeof loader>();
  const [selectedProduct, setSelectedProduct] =
    useState<ProductSelectorSelection | null>(null);
  const [productId, setProductId] = useState("");
  const [showManualProductId, setShowManualProductId] = useState(false);

  const search =
    typeof window !== "undefined" ? window.location.search : "";

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
    resetResult,
    localesIsFallback,
  } = useGenerateDescription({
    locationSearch: search,
    initialShopLocales: loaderData.shopLocales,
    toastShow: (message) => {
      shopify.toast.show(message);
    },
  });

  const handleGenerate = async () => {
    const pid = (selectedProduct?.id ?? productId).trim();
    await submitGenerate(pid);
  };

  const copyBusy = copyTarget !== null;

  return (
    <s-page heading="生成商品描述">
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "1.5rem",
          alignItems: "flex-start",
        }}
      >
        <div style={{ flex: "1 1 420px", minWidth: 0 }}>
          <s-stack direction="block" gap="large">
            <s-section heading="商品描述生成">
              <s-stack direction="block" gap="base">
                <div
                  style={{
                    fontSize: "0.875rem",
                    color: "#6d7175",
                    lineHeight: 1.5,
                  }}
                >
                  基于当前店铺在 Shopify 中的商品数据生成营销描述。请先在下方搜索并选择商品；
                  目标语言默认与店铺主语言一致，可在下拉中切换。与 AI Assistant 页快捷入口使用同一套服务端能力。
                </div>
                <ProductSelector
                  locationSearch={search}
                  selected={selectedProduct}
                  onSelectedChange={setSelectedProduct}
                />
                <details
                  style={{ marginTop: "0.25rem" }}
                  open={showManualProductId}
                  onToggle={(e) =>
                    setShowManualProductId(e.currentTarget.open)
                  }
                >
                  <summary
                    style={{
                      cursor: "pointer",
                      fontSize: "0.8125rem",
                      color: "#2c6ecb",
                      userSelect: "none",
                    }}
                  >
                    高级：手动输入商品 ID
                  </summary>
                  <div style={{ marginTop: "0.65rem" }}>
                    <s-text-field
                      label="商品 ID（数字或 gid://shopify/Product/…）"
                      value={productId}
                      onChange={(e) => setProductId(e.currentTarget.value)}
                      autocomplete="off"
                    />
                  </div>
                </details>

                <div>
                  <label
                    htmlFor="generate-description-lang"
                    style={{
                      display: "block",
                      fontSize: "0.8125rem",
                      fontWeight: 500,
                      color: "#303030",
                    }}
                  >
                    目标语言
                  </label>
                  <select
                    id="generate-description-lang"
                    value={targetLanguage}
                    onChange={(e) => setTargetLanguage(e.target.value)}
                    disabled={localesLoading || isSubmitting}
                    style={{
                      display: "block",
                      width: "100%",
                      maxWidth: "100%",
                      marginTop: "0.35rem",
                      padding: "0.5rem 0.65rem",
                      fontSize: "0.875rem",
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
                        marginTop: "0.35rem",
                        fontSize: "0.75rem",
                        color: "#6d7175",
                        lineHeight: 1.45,
                      }}
                    >
                      当前为内置语言列表。若已在应用配置中授权{" "}
                      <code style={{ fontSize: "0.7rem" }}>read_locales</code>{" "}
                      并重新安装应用，将自动同步店铺在 Shopify 中启用的语言。
                    </div>
                  ) : null}
                </div>

                {errorText ? (
                  <div
                    style={{
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
                  <s-section heading="生成结果">
                    <s-stack direction="block" gap="small">
                      <div
                        style={{
                          fontSize: "0.875rem",
                          color: "#303030",
                          lineHeight: 1.55,
                        }}
                      >
                        商品名：
                        {productTitle?.trim()
                          ? productTitle
                          : "Unknown Product"}
                      </div>
                      <div
                        style={{
                          padding: "0.75rem 0.85rem",
                          borderRadius: "10px",
                          background: "rgba(44, 110, 203, 0.06)",
                          border: "1px solid rgba(44, 110, 203, 0.2)",
                          fontSize: "0.875rem",
                          color: "#303030",
                          whiteSpace: "pre-wrap",
                          lineHeight: 1.55,
                        }}
                      >
                        {description}
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
                          {copyTarget === "description"
                            ? "复制中…"
                            : "复制描述"}
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
                    </s-stack>
                  </s-section>
                ) : null}

                <s-stack direction="inline" gap="small">
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
                  <s-button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      resetResult();
                      setSelectedProduct(null);
                      setProductId("");
                    }}
                    {...(isSubmitting ? { disabled: true } : {})}
                  >
                    清空结果
                  </s-button>
                </s-stack>
              </s-stack>
            </s-section>
          </s-stack>
        </div>
      </div>
    </s-page>
  );
}
