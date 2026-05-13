import { useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useLoaderData } from "react-router";
import type { loader } from "../app.generate-description";
import type { GenerateDescriptionApiResponse } from "../../lib/generateDescriptionTypes";

export function GenerateDescriptionPage() {
  const shopify = useAppBridge();
  const loaderData = useLoaderData<typeof loader>();
  const [productId, setProductId] = useState("");
  const [targetLanguage, setTargetLanguage] = useState(
    loaderData.defaultTargetLanguage,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [productTitle, setProductTitle] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);

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
    setDescription(null);

    const query = typeof window !== "undefined" ? window.location.search : "";
    try {
      // 走独立 API：裸 JSON + 与聊天卡片一致；避免对 /app/* 路由 action 的 fetch 在 RR/嵌入壳下解析异常。
      const response = await fetch(`/api/generate-description${query}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
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
        payload.success === true &&
        payload.response &&
        typeof payload.response.description === "string" &&
        typeof payload.response.title === "string"
      ) {
        setProductTitle(payload.response.title);
        setDescription(payload.response.description);
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
                  基于当前店铺在 Shopify 中的商品数据生成营销描述。商品 ID 可为数字或
                  gid://shopify/Product/…；目标语言示例：zh-CN、en、ja。与 AI Assistant
                  页快捷入口使用同一套服务端能力。
                </div>
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
                    </s-stack>
                  </s-section>
                ) : null}

                <s-stack direction="inline" gap="small">
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={handleGenerate}
                    {...(isSubmitting ? { disabled: true } : {})}
                  >
                    {isSubmitting ? "正在生成…" : "生成描述"}
                  </s-button>
                  <s-button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setProductTitle(null);
                      setDescription(null);
                      setErrorText(null);
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
