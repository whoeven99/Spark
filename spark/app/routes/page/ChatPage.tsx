import { useState, useRef, useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { ChatMessages } from "../component/ChatMessages";
import { ChatInput } from "../component/ChatInput";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type ProviderItem = {
  id: string;
  name: string;
};

export function ChatPage() {
  const shopify = useAppBridge();
  const [isSending, setIsSending] = useState(false);
  const [metaClientId, setMetaClientId] = useState("");
  const [metaClientSecret, setMetaClientSecret] = useState("");
  const [metaConfigured, setMetaConfigured] = useState(false);
  const [metaClientIdMasked, setMetaClientIdMasked] = useState("");
  const [isSavingMetaConfig, setIsSavingMetaConfig] = useState(false);
  const adProviders: ProviderItem[] = [
    { id: "meta", name: "Meta Ads（Facebook/Instagram）" },
    { id: "google", name: "Google Ads" },
    { id: "tiktok", name: "TikTok Ads" },
    { id: "pinterest", name: "Pinterest Ads" },
    { id: "snap", name: "Snapchat Ads" },
    { id: "microsoft", name: "Microsoft Ads（Bing）" },
  ];
  const logisticsProviders: ProviderItem[] = [
    { id: "sf", name: "顺丰速运（SF Express）" },
    { id: "jd", name: "京东物流（JD Logistics）" },
    { id: "yto", name: "圆通速递（YTO）" },
    { id: "zto", name: "中通快递（ZTO）" },
    { id: "fedex", name: "FedEx" },
    { id: "dhl", name: "DHL Express" },
  ];
  const initialAssistantMessage =
    "你好，我是你的店铺助手。你可以问我业务问题，或让我查当前时间、某城市天气等。";
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: initialAssistantMessage,
    },
  ]);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const quickPrompts = [
    "给我 3 个提升转化率的建议",
    "帮我写一段新品上架文案",
    "今天适合做什么促销活动？",
  ];
  const quickPromptTones: Array<"info" | "success" | "caution"> = [
    "info",
    "success",
    "caution",
  ];

  const scrollToBottom = () => {
    setTimeout(() => {
      const container = messagesContainerRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }, 0);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.location.search;
    fetch(`/app/ads/meta/config${query}`)
      .then((res) => res.json())
      .then((data: { configured?: boolean; clientIdMasked?: string }) => {
        setMetaConfigured(Boolean(data.configured));
        setMetaClientIdMasked(data.clientIdMasked ?? "");
      })
      .catch(() => {
        // noop
      });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const adAuth = params.get("adAuth");
    if (!adAuth) return;

    if (adAuth === "meta_success") {
      shopify.toast.show("Meta Ads 授权成功");
    } else if (adAuth === "meta_cancelled") {
      shopify.toast.show("你已取消 Meta Ads 授权");
    } else if (adAuth === "meta_error") {
      const reason = params.get("reason") || "未知原因";
      shopify.toast.show(`Meta Ads 授权失败：${reason}`);
    }

    params.delete("adAuth");
    params.delete("reason");
    const nextSearch = params.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`,
    );
  }, [shopify]);

  const sendMessage = async (content: string) => {
    if (isSending) return;
    setMessages((prev) => [...prev, { role: "user", content }]);
    setIsSending(true);

    try {
      const authQuery = typeof window !== "undefined" ? window.location.search : "";
      const response = await fetch(`/chat${authQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content }),
      });

      const data: { reply?: string; error?: string } = await response.json().catch(() => ({}));
      const assistantText =
        data.reply?.trim() ||
        data.error?.trim() ||
        (!response.ok
          ? `请求失败（${response.status}），请稍后重试。`
          : "未收到有效回复，请重试。");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: assistantText,
        },
      ]);
    } catch {
      shopify.toast.show("发送失败，请稍后重试");
    } finally {
      setIsSending(false);
    }
  };

  const handleAuthorizeProvider = (providerName: string, category: string) => {
    if (providerName.includes("Meta Ads")) {
      if (!metaConfigured) {
        shopify.toast.show("请先填写并保存 Meta App ID / Secret");
        return;
      }
      const query = typeof window !== "undefined" ? window.location.search : "";
      window.location.assign(`/app/ads/meta/start${query}`);
      return;
    }
    shopify.toast.show(`${providerName} ${category}授权流程待接入（OAuth）`);
  };

  const handleSaveMetaConfig = async () => {
    const clientId = metaClientId.trim();
    const clientSecret = metaClientSecret.trim();
    if (!clientId || !clientSecret) {
      shopify.toast.show("请填写完整的 Meta App ID 和 Meta App Secret");
      return;
    }

    setIsSavingMetaConfig(true);
    try {
      const query = typeof window !== "undefined" ? window.location.search : "";
      const response = await fetch(`/app/ads/meta/config${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, clientSecret }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        configured?: boolean;
        clientIdMasked?: string;
      };
      if (!response.ok || !data.ok) {
        shopify.toast.show(data.error || `保存失败（${response.status}）`);
        return;
      }

      setMetaConfigured(Boolean(data.configured));
      setMetaClientIdMasked(data.clientIdMasked ?? "");
      setMetaClientSecret("");
      shopify.toast.show("Meta 配置已保存");
    } catch {
      shopify.toast.show("保存 Meta 配置失败，请稍后重试");
    } finally {
      setIsSavingMetaConfig(false);
    }
  };

  const renderProviderRows = (providers: ProviderItem[], category: string) => {
    return (
      <s-stack direction="block" gap="small">
        {providers.map((provider) => (
          <div
            key={provider.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              padding: "0.15rem 0",
            }}
          >
            <div
              style={{
                flex: 1,
                minWidth: 0,
                lineHeight: 1.35,
                wordBreak: "break-word",
              }}
            >
              {provider.name}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                flexShrink: 0,
              }}
            >
              <span style={{ whiteSpace: "nowrap" }}>
                <s-badge tone="critical">未授权</s-badge>
              </span>
              <s-button
                type="button"
                variant="secondary"
                size="slim"
                onClick={() => handleAuthorizeProvider(provider.name, category)}
              >
                去授权
              </s-button>
            </div>
          </div>
        ))}
      </s-stack>
    );
  };

  return (
    <s-page heading="Shopify Ai Assistant">
      <s-section heading="智能问答">
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-paragraph>
            使用 Shopify 管理后台内置风格组件，快速获得运营建议、文案草稿和常见业务分析。
          </s-paragraph>
          <s-badge tone="success">助手在线</s-badge>
        </s-stack>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            height: "calc(100dvh - 140px)",
            minHeight: "calc(100dvh - 140px)",
            gap: "0.75rem",
          }}
        >
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="inline" gap="base">
              {quickPrompts.map((prompt, index) => (
                <s-button
                  key={prompt}
                  type="button"
                  tone={quickPromptTones[index]}
                  variant="secondary"
                  onClick={() => sendMessage(prompt)}
                  {...(isSending ? { disabled: true } : {})}
                >
                  {prompt}
                </s-button>
              ))}
              <s-button
                type="button"
                tone="critical"
                variant="secondary"
                onClick={() =>
                  setMessages([{ role: "assistant", content: initialAssistantMessage }])
                }
                {...(isSending ? { disabled: true } : {})}
              >
                清空会话
              </s-button>
            </s-stack>
          </s-box>

          <div style={{ flex: 1, minHeight: 0 }}>
            <div
              ref={messagesContainerRef}
              style={{ height: "100%", overflowY: "auto" }}
            >
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
              >
                <ChatMessages messages={messages} />
              </s-box>
            </div>
          </div>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <ChatInput onMessageSend={sendMessage} isSending={isSending} />
          </s-box>
        </div>
      </s-section>

      <s-section slot="aside" heading="使用建议">
        <s-unordered-list>
          <s-list-item>尽量一次只提一个问题，回答会更准确。</s-list-item>
          <s-list-item>可直接说明场景，例如“新客拉新”“复购提升”。</s-list-item>
          <s-list-item>需要执行动作时，请明确给出目标和限制条件。</s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section slot="aside" heading="广告数据授权">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            授权广告平台后，AI 可结合渠道来源分析投放表现（如 ROAS、转化、渠道贡献）。
          </s-paragraph>
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="small">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <strong>Meta 开发者配置</strong>
                <s-badge tone={metaConfigured ? "success" : "critical"}>
                  {metaConfigured ? "已配置" : "未配置"}
                </s-badge>
              </div>
              {metaClientIdMasked ? (
                <s-paragraph>当前 App ID：{metaClientIdMasked}</s-paragraph>
              ) : null}
              <s-text-field
                label="Meta App ID"
                value={metaClientId}
                onChange={(e) => setMetaClientId(e.currentTarget.value)}
                autocomplete="off"
              />
              <s-text-field
                label="Meta App Secret"
                value={metaClientSecret}
                onChange={(e) => setMetaClientSecret(e.currentTarget.value)}
                autocomplete="off"
              />
              <s-button
                type="button"
                variant="secondary"
                onClick={handleSaveMetaConfig}
                {...(isSavingMetaConfig ? { disabled: true } : {})}
              >
                {isSavingMetaConfig ? "保存中..." : "保存 Meta 配置"}
              </s-button>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            {renderProviderRows(adProviders, "广告")}
          </s-box>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="物流数据授权">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            授权物流平台后，AI 可结合妥投时效、运输异常、签收率等指标做履约分析。
          </s-paragraph>
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            {renderProviderRows(logisticsProviders, "物流")}
          </s-box>
        </s-stack>
      </s-section>
    </s-page>
  );
}
