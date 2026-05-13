import { useState, type CSSProperties } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { GenerateDescriptionApiResponse } from "../../../lib/generateDescriptionTypes";

type Props = {
  /** 嵌在助手气泡内时略收紧边距与阴影 */
  embedded?: boolean;
};

export function GenerateDescriptionChatCard({ embedded = false }: Props) {
  const shopify = useAppBridge();
  const [productId, setProductId] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("zh-CN");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [productTitle, setProductTitle] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const search = typeof window !== "undefined" ? window.location.search : "";

  const handleGenerate = async () => {
    const pid = productId.trim();
    if (!pid) {
      shopify.toast.show("请填写商品 ID");
      return;
    }
    const lang = targetLanguage.trim();
    if (!lang) {
      shopify.toast.show("请填写目标语言");
      return;
    }

    setIsSubmitting(true);
    setErrorText(null);
    setProductTitle(null);
    setResult(null);

    try {
      const response = await fetch(`/api/generate-description${search}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: pid, targetLanguage: lang }),
      });
      const payload = (await response.json().catch(() => ({}))) as GenerateDescriptionApiResponse;

      if (!response.ok || payload.success === false) {
        const msg =
          payload.success === false
            ? payload.errorMsg
            : `请求失败（${response.status}）`;
        setErrorText(msg || `请求失败（${response.status}）`);
        return;
      }

      if (
        payload.success &&
        payload.response &&
        typeof payload.response.title === "string" &&
        typeof payload.response.description === "string"
      ) {
        setProductTitle(payload.response.title);
        setResult(payload.response.description);
        shopify.toast.show("描述生成成功");
      } else {
        setErrorText("返回数据异常，请重试");
      }
    } catch {
      const msg = "网络异常，请稍后重试";
      setErrorText(msg);
      shopify.toast.show(msg);
    } finally {
      setIsSubmitting(false);
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
              基于当前店铺在 Shopify 中的商品数据生成营销描述。商品 ID 可为数字或 gid://shopify/Product/…
              ；目标语言示例：zh-CN、en、ja。
            </div>
          </div>

          <div style={{ ...fieldGridStyle, marginBottom: "0.85rem" }}>
            <s-text-field
              label="商品 ID"
              value={productId}
              onChange={(e) => setProductId(e.currentTarget.value)}
              autocomplete="off"
            />
            <s-text-field
              label="目标语言"
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.currentTarget.value)}
              autocomplete="off"
            />
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

          {result ? (
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
                  {result}
                </div>
              </div>
            </div>
          ) : null}

          <s-stack direction="block" gap="small">
            <div style={primaryBtnStyle}>
              <s-button
                type="button"
                variant="primary"
                onClick={handleGenerate}
                {...(isSubmitting ? { disabled: true } : {})}
              >
                {isSubmitting ? "正在生成…" : "生成描述"}
              </s-button>
            </div>
          </s-stack>
        </div>
      </div>
    </div>
  );
}
