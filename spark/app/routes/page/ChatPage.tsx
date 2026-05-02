import { useState, useRef, useEffect, type CSSProperties } from "react";
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
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [googleDeveloperToken, setGoogleDeveloperToken] = useState("");
  const [googleCustomerId, setGoogleCustomerId] = useState("");
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [googleClientIdMasked, setGoogleClientIdMasked] = useState("");
  const [isSavingGoogleConfig, setIsSavingGoogleConfig] = useState(false);
  const [isGoogleAuthModalOpen, setIsGoogleAuthModalOpen] = useState(false);
  const [tiktokAppId, setTiktokAppId] = useState("");
  const [tiktokAppSecret, setTiktokAppSecret] = useState("");
  const [tiktokAdvertiserId, setTiktokAdvertiserId] = useState("");
  const [tiktokConfigured, setTiktokConfigured] = useState(false);
  const [tiktokAppIdMasked, setTiktokAppIdMasked] = useState("");
  const [isSavingTiktokConfig, setIsSavingTiktokConfig] = useState(false);
  const [isTiktokAuthModalOpen, setIsTiktokAuthModalOpen] = useState(false);
  const [microsoftClientId, setMicrosoftClientId] = useState("");
  const [microsoftClientSecret, setMicrosoftClientSecret] = useState("");
  const [microsoftDeveloperToken, setMicrosoftDeveloperToken] = useState("");
  const [microsoftCustomerId, setMicrosoftCustomerId] = useState("");
  const [microsoftConfigured, setMicrosoftConfigured] = useState(false);
  const [microsoftClientIdMasked, setMicrosoftClientIdMasked] = useState("");
  const [isSavingMicrosoftConfig, setIsSavingMicrosoftConfig] = useState(false);
  const [isMicrosoftAuthModalOpen, setIsMicrosoftAuthModalOpen] = useState(false);
  const [sfCustomerCode, setSfCustomerCode] = useState("");
  const [sfCheckWord, setSfCheckWord] = useState("");
  const [sfMonthlyAccount, setSfMonthlyAccount] = useState("");
  const [sfConfigured, setSfConfigured] = useState(false);
  const [sfCustomerCodeMasked, setSfCustomerCodeMasked] = useState("");
  const [isSavingSfConfig, setIsSavingSfConfig] = useState(false);
  const [isSfAuthModalOpen, setIsSfAuthModalOpen] = useState(false);
  const [fedexApiKey, setFedexApiKey] = useState("");
  const [fedexSecretKey, setFedexSecretKey] = useState("");
  const [fedexAccountNumber, setFedexAccountNumber] = useState("");
  const [fedexMeterNumber, setFedexMeterNumber] = useState("");
  const [fedexConfigured, setFedexConfigured] = useState(false);
  const [fedexAccountNumberMasked, setFedexAccountNumberMasked] = useState("");
  const [isSavingFedexConfig, setIsSavingFedexConfig] = useState(false);
  const [isFedexAuthModalOpen, setIsFedexAuthModalOpen] = useState(false);
  const [isSuggestionModalOpen, setIsSuggestionModalOpen] = useState(false);
  const [suggestionText, setSuggestionText] = useState("");
  const [isSubmittingSuggestion, setIsSubmittingSuggestion] = useState(false);
  const adProviders: ProviderItem[] = [
    { id: "google", name: "Google Ads" },
    { id: "tiktok", name: "TikTok Ads" },
    { id: "microsoft", name: "Microsoft Ads（Bing）" },
  ];
  const logisticsProviders: ProviderItem[] = [
    { id: "sf", name: "顺丰速运（SF Express）" },
    { id: "fedex", name: "FedEx" },
  ];
  const initialAssistantMessage =
    "你好，我是你的店铺助手。我目前支持：1）店铺经营分析与诊断建议；2）广告与物流授权相关引导；3）运营文案和促销活动建议；4）常见业务问题问答。你可以直接告诉我你的目标。";
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: initialAssistantMessage,
    },
  ]);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const quickPrompts = [
    "你有哪些功能",
    "看今天店铺+广告数据",
    "今天适合做什么活动",
  ];
  const quickPromptTones: Array<"info" | "success" | "caution"> = [
    "info",
    "success",
    "caution",
  ];
  const modalOverlayStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: "1rem",
  };
  const modalCardStyle: CSSProperties = {
    width: "100%",
    maxWidth: "560px",
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    boxShadow: "0 12px 30px rgba(0, 0, 0, 0.2)",
  };
  const asideCardStyle: CSSProperties = {
    border: "1px solid #e3e3e3",
    borderRadius: "12px",
    backgroundColor: "#fafafa",
    padding: "0.75rem",
  };
  const summaryStyle: CSSProperties = {
    cursor: "pointer",
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  };

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
    fetch(`/app/ads/google/config${query}`)
      .then((res) => res.json())
      .then((data: { configured?: boolean; clientIdMasked?: string }) => {
        setGoogleConfigured(Boolean(data.configured));
        setGoogleClientIdMasked(data.clientIdMasked ?? "");
      })
      .catch(() => {
        // noop
      });
    fetch(`/app/ads/tiktok/config${query}`)
      .then((res) => res.json())
      .then((data: { configured?: boolean; appIdMasked?: string }) => {
        setTiktokConfigured(Boolean(data.configured));
        setTiktokAppIdMasked(data.appIdMasked ?? "");
      })
      .catch(() => {
        // noop
      });
    fetch(`/app/ads/microsoft/config${query}`)
      .then((res) => res.json())
      .then((data: { configured?: boolean; clientIdMasked?: string }) => {
        setMicrosoftConfigured(Boolean(data.configured));
        setMicrosoftClientIdMasked(data.clientIdMasked ?? "");
      })
      .catch(() => {
        // noop
      });
    fetch(`/app/logistics/sf/config${query}`)
      .then((res) => res.json())
      .then((data: { configured?: boolean; customerCodeMasked?: string }) => {
        setSfConfigured(Boolean(data.configured));
        setSfCustomerCodeMasked(data.customerCodeMasked ?? "");
      })
      .catch(() => {
        // noop
      });
    fetch(`/app/logistics/fedex/config${query}`)
      .then((res) => res.json())
      .then((data: { configured?: boolean; accountNumberMasked?: string }) => {
        setFedexConfigured(Boolean(data.configured));
        setFedexAccountNumberMasked(data.accountNumberMasked ?? "");
      })
      .catch(() => {
        // noop
      });
  }, []);

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

  const handleAuthorizeProvider = (provider: ProviderItem, category: string) => {
    if (category === "广告" && provider.id === "google") {
      setIsGoogleAuthModalOpen(true);
      return;
    }
    if (category === "广告" && provider.id === "tiktok") {
      setIsTiktokAuthModalOpen(true);
      return;
    }
    if (category === "广告" && provider.id === "microsoft") {
      setIsMicrosoftAuthModalOpen(true);
      return;
    }
    if (provider.id === "sf" && category === "物流") {
      setIsSfAuthModalOpen(true);
      return;
    }
    if (provider.id === "fedex" && category === "物流") {
      setIsFedexAuthModalOpen(true);
      return;
    }
    shopify.toast.show(`${provider.name} ${category}授权流程待接入（OAuth）`);
  };

  const handleSaveGoogleConfig = async () => {
    const clientId = googleClientId.trim();
    const clientSecret = googleClientSecret.trim();
    const developerToken = googleDeveloperToken.trim();
    const customerId = googleCustomerId.trim();
    if (!clientId || !clientSecret || !developerToken || !customerId) {
      shopify.toast.show("请完整填写 Google Ads 授权信息");
      return;
    }

    setIsSavingGoogleConfig(true);
    try {
      const query = typeof window !== "undefined" ? window.location.search : "";
      const response = await fetch(`/app/ads/google/config${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, clientSecret, developerToken, customerId }),
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

      setGoogleConfigured(Boolean(data.configured));
      setGoogleClientIdMasked(data.clientIdMasked ?? "");
      setGoogleClientSecret("");
      setIsGoogleAuthModalOpen(false);
      shopify.toast.show("Google Ads 授权信息已保存");
    } catch {
      shopify.toast.show("保存 Google Ads 授权信息失败，请稍后重试");
    } finally {
      setIsSavingGoogleConfig(false);
    }
  };

  const handleSaveTiktokConfig = async () => {
    const appId = tiktokAppId.trim();
    const appSecret = tiktokAppSecret.trim();
    const advertiserId = tiktokAdvertiserId.trim();
    if (!appId || !appSecret || !advertiserId) {
      shopify.toast.show("请完整填写 TikTok Ads 授权信息");
      return;
    }

    setIsSavingTiktokConfig(true);
    try {
      const query = typeof window !== "undefined" ? window.location.search : "";
      const response = await fetch(`/app/ads/tiktok/config${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId, appSecret, advertiserId }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        configured?: boolean;
        appIdMasked?: string;
      };
      if (!response.ok || !data.ok) {
        shopify.toast.show(data.error || `保存失败（${response.status}）`);
        return;
      }

      setTiktokConfigured(Boolean(data.configured));
      setTiktokAppIdMasked(data.appIdMasked ?? "");
      setTiktokAppSecret("");
      setIsTiktokAuthModalOpen(false);
      shopify.toast.show("TikTok Ads 授权信息已保存");
    } catch {
      shopify.toast.show("保存 TikTok Ads 授权信息失败，请稍后重试");
    } finally {
      setIsSavingTiktokConfig(false);
    }
  };

  const handleSaveMicrosoftConfig = async () => {
    const clientId = microsoftClientId.trim();
    const clientSecret = microsoftClientSecret.trim();
    const developerToken = microsoftDeveloperToken.trim();
    const customerId = microsoftCustomerId.trim();
    if (!clientId || !clientSecret || !developerToken || !customerId) {
      shopify.toast.show("请完整填写 Microsoft Ads 授权信息");
      return;
    }

    setIsSavingMicrosoftConfig(true);
    try {
      const query = typeof window !== "undefined" ? window.location.search : "";
      const response = await fetch(`/app/ads/microsoft/config${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, clientSecret, developerToken, customerId }),
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

      setMicrosoftConfigured(Boolean(data.configured));
      setMicrosoftClientIdMasked(data.clientIdMasked ?? "");
      setMicrosoftClientSecret("");
      setIsMicrosoftAuthModalOpen(false);
      shopify.toast.show("Microsoft Ads 授权信息已保存");
    } catch {
      shopify.toast.show("保存 Microsoft Ads 授权信息失败，请稍后重试");
    } finally {
      setIsSavingMicrosoftConfig(false);
    }
  };

  const handleSaveSfConfig = async () => {
    const customerCode = sfCustomerCode.trim();
    const checkWord = sfCheckWord.trim();
    const monthlyAccount = sfMonthlyAccount.trim();

    if (!customerCode || !checkWord) {
      shopify.toast.show("请填写顺丰顾客编码和校验码");
      return;
    }

    setIsSavingSfConfig(true);
    try {
      const query = typeof window !== "undefined" ? window.location.search : "";
      const response = await fetch(`/app/logistics/sf/config${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerCode, checkWord, monthlyAccount }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        configured?: boolean;
        customerCodeMasked?: string;
      };
      if (!response.ok || !data.ok) {
        shopify.toast.show(data.error || `保存失败（${response.status}）`);
        return;
      }

      setSfConfigured(Boolean(data.configured));
      setSfCustomerCodeMasked(data.customerCodeMasked ?? "");
      setSfCheckWord("");
      setIsSfAuthModalOpen(false);
      shopify.toast.show("顺丰接口配置已保存");
    } catch {
      shopify.toast.show("保存顺丰接口配置失败，请稍后重试");
    } finally {
      setIsSavingSfConfig(false);
    }
  };

  const handleSaveFedexConfig = async () => {
    const apiKey = fedexApiKey.trim();
    const secretKey = fedexSecretKey.trim();
    const accountNumber = fedexAccountNumber.trim();
    const meterNumber = fedexMeterNumber.trim();

    if (!apiKey || !secretKey || !accountNumber) {
      shopify.toast.show("请填写 FedEx 的 API Key、Secret Key、Account Number");
      return;
    }

    setIsSavingFedexConfig(true);
    try {
      const query = typeof window !== "undefined" ? window.location.search : "";
      const response = await fetch(`/app/logistics/fedex/config${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, secretKey, accountNumber, meterNumber }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        configured?: boolean;
        accountNumberMasked?: string;
      };
      if (!response.ok || !data.ok) {
        shopify.toast.show(data.error || `保存失败（${response.status}）`);
        return;
      }

      setFedexConfigured(Boolean(data.configured));
      setFedexAccountNumberMasked(data.accountNumberMasked ?? "");
      setFedexSecretKey("");
      setIsFedexAuthModalOpen(false);
      shopify.toast.show("FedEx 授权信息已保存");
    } catch {
      shopify.toast.show("保存 FedEx 授权信息失败，请稍后重试");
    } finally {
      setIsSavingFedexConfig(false);
    }
  };

  const handleSubmitSuggestion = async () => {
    const content = suggestionText.trim();
    if (!content) {
      shopify.toast.show("内容不能为空");
      return;
    }

    setIsSubmittingSuggestion(true);
    try {
      const query = typeof window !== "undefined" ? window.location.search : "";
      const response = await fetch(`/app/feedback/suggestion${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestion: content }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      if (!response.ok || !data.ok) {
        shopify.toast.show(data.error || `提交失败（${response.status}）`);
        return;
      }
      setSuggestionText("");
      setIsSuggestionModalOpen(false);
      shopify.toast.show(data.message || "提交成功，感谢您的建议");
    } catch {
      shopify.toast.show("提交建议失败，请稍后重试");
    } finally {
      setIsSubmittingSuggestion(false);
    }
  };

  const renderProviderRows = (providers: ProviderItem[], category: string) => {
    const isConfigured = (providerId: string) => {
      if (category === "物流" && providerId === "sf") return sfConfigured;
      if (category === "物流" && providerId === "fedex") return fedexConfigured;
      if (category === "广告" && providerId === "google") return googleConfigured;
      if (category === "广告" && providerId === "tiktok") return tiktokConfigured;
      if (category === "广告" && providerId === "microsoft") return microsoftConfigured;
      return false;
    };

    return (
      <s-stack direction="block" gap="small">
        {providers.map((provider, index) => (
          <div
            key={provider.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              padding: "0.5rem 0",
              borderBottom: index < providers.length - 1 ? "1px solid #ececec" : "none",
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
                <s-badge tone={isConfigured(provider.id) ? "success" : "critical"}>
                  {isConfigured(provider.id) ? "已配置" : "未授权"}
                </s-badge>
              </span>
              <s-button
                type="button"
                variant="secondary"
                size="slim"
                onClick={() => handleAuthorizeProvider(provider, category)}
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
            你可以在这里直接提问，获取店铺经营分析、广告/物流授权引导和运营建议。
          </s-paragraph>
          <s-badge tone="success">AI 助手在线</s-badge>
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
          <s-box padding="small" borderWidth="base" borderRadius="base" background="base">
            <s-stack direction="block" gap="none">
              <s-paragraph>快捷问题</s-paragraph>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.25rem" }}>
              {quickPrompts.map((prompt, index) => (
                <s-button
                  key={prompt}
                  type="button"
                  tone={quickPromptTones[index]}
                  variant="secondary"
                  size="slim"
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
                size="slim"
                onClick={() =>
                  setMessages([{ role: "assistant", content: initialAssistantMessage }])
                }
                {...(isSending ? { disabled: true } : {})}
              >
                清空会话
              </s-button>
              </div>
            </s-stack>
          </s-box>

          <div style={{ flex: 1, minHeight: 0 }}>
            <div
              ref={messagesContainerRef}
              style={{ height: "100%", overflowY: "auto" }}
            >
              <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
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
        <div style={asideCardStyle}>
          <s-unordered-list>
            <s-list-item>尽量一次只提一个问题，回答会更准确。</s-list-item>
            <s-list-item>可直接说明场景，例如“新客拉新”“复购提升”。</s-list-item>
            <s-list-item>需要执行动作时，请明确给出目标和限制条件。</s-list-item>
          </s-unordered-list>
        </div>
      </s-section>

      <s-section slot="aside" heading="提交建议">
        <div style={asideCardStyle}>
          <s-stack direction="block" gap="small">
            <s-paragraph>在此输入你想要 assistant 添加的功能。</s-paragraph>
            <s-button type="button" variant="secondary" onClick={() => setIsSuggestionModalOpen(true)}>
              点击提交建议
            </s-button>
          </s-stack>
        </div>
      </s-section>

      <s-section slot="aside">
        <s-stack direction="block" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
            <details>
              <summary style={summaryStyle}>
                <span>广告数据授权</span>
                <span>点击展开</span>
              </summary>
              <div style={{ marginTop: "0.75rem" }}>
                <s-stack direction="block" gap="base">
                  <s-paragraph>
                    授权广告平台后，AI 可结合渠道来源分析投放表现（如 ROAS、转化、渠道贡献）。
                  </s-paragraph>
                  <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                    {renderProviderRows(adProviders, "广告")}
                  </s-box>
                </s-stack>
              </div>
            </details>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
            <details>
              <summary style={summaryStyle}>
                <span>物流数据授权</span>
                <span>点击展开</span>
              </summary>
              <div style={{ marginTop: "0.75rem" }}>
                <s-stack direction="block" gap="base">
                  <s-paragraph>
                    授权物流平台后，AI 可结合妥投时效、运输异常、签收率等指标做履约分析。
                  </s-paragraph>
                  <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                    {renderProviderRows(logisticsProviders, "物流")}
                  </s-box>
                </s-stack>
              </div>
            </details>
          </s-box>
        </s-stack>
      </s-section>

      {isGoogleAuthModalOpen ? (
        <div style={modalOverlayStyle} onClick={() => setIsGoogleAuthModalOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={modalCardStyle}>
            <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
              <s-stack direction="block" gap="base">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <strong>Google Ads 授权信息</strong>
                  <s-badge tone={googleConfigured ? "success" : "critical"}>
                    {googleConfigured ? "已配置" : "未配置"}
                  </s-badge>
                </div>
                {googleClientIdMasked ? <s-paragraph>当前 Client ID：{googleClientIdMasked}</s-paragraph> : null}
                <s-box padding="small" borderWidth="base" borderRadius="base" background="subdued">
                  <s-stack direction="block" gap="small">
                    <s-unordered-list>
                      <s-list-item>
                        OAuth Client ID：在 Google Cloud Console 的 OAuth 凭据页面获取。
                      </s-list-item>
                      <s-list-item>
                        OAuth Client Secret：与 Client ID 在同一凭据项中获取。
                      </s-list-item>
                      <s-list-item>
                        Developer Token：在 Google Ads 后台的 API Center 申请/查看。
                      </s-list-item>
                      <s-list-item>
                        Customer ID：Google Ads 账户 ID，建议填写纯数字（去掉中划线）。
                      </s-list-item>
                    </s-unordered-list>
                  </s-stack>
                </s-box>
                <s-text-field
                  label="OAuth Client ID"
                  value={googleClientId}
                  onChange={(e) => setGoogleClientId(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label="OAuth Client Secret"
                  value={googleClientSecret}
                  onChange={(e) => setGoogleClientSecret(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label="Developer Token"
                  value={googleDeveloperToken}
                  onChange={(e) => setGoogleDeveloperToken(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label="Customer ID"
                  value={googleCustomerId}
                  onChange={(e) => setGoogleCustomerId(e.currentTarget.value)}
                  autocomplete="off"
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                  <s-button
                    type="button"
                    variant="secondary"
                    onClick={() => setIsGoogleAuthModalOpen(false)}
                    {...(isSavingGoogleConfig ? { disabled: true } : {})}
                  >
                    取消
                  </s-button>
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={handleSaveGoogleConfig}
                    {...(isSavingGoogleConfig ? { disabled: true } : {})}
                  >
                    {isSavingGoogleConfig ? "保存中..." : "保存授权信息"}
                  </s-button>
                </div>
              </s-stack>
            </s-box>
          </div>
        </div>
      ) : null}

      {isTiktokAuthModalOpen ? (
        <div style={modalOverlayStyle} onClick={() => setIsTiktokAuthModalOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={modalCardStyle}>
            <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
              <s-stack direction="block" gap="base">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <strong>TikTok Ads 授权信息</strong>
                  <s-badge tone={tiktokConfigured ? "success" : "critical"}>
                    {tiktokConfigured ? "已配置" : "未配置"}
                  </s-badge>
                </div>
                {tiktokAppIdMasked ? <s-paragraph>当前 App ID：{tiktokAppIdMasked}</s-paragraph> : null}
                <s-box padding="small" borderWidth="base" borderRadius="base" background="subdued">
                  <s-stack direction="block" gap="small">
                    <s-unordered-list>
                      <s-list-item>
                        App ID：在 TikTok for Business 开发者后台创建应用后获取。
                      </s-list-item>
                      <s-list-item>
                        App Secret：与 App ID 同一应用配置页获取。
                      </s-list-item>
                      <s-list-item>
                        Advertiser ID：在 TikTok Ads 广告主账户信息页查看（通常为纯数字字符串）。
                      </s-list-item>
                    </s-unordered-list>
                  </s-stack>
                </s-box>
                <s-text-field
                  label="App ID"
                  value={tiktokAppId}
                  onChange={(e) => setTiktokAppId(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label="App Secret"
                  value={tiktokAppSecret}
                  onChange={(e) => setTiktokAppSecret(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label="Advertiser ID"
                  value={tiktokAdvertiserId}
                  onChange={(e) => setTiktokAdvertiserId(e.currentTarget.value)}
                  autocomplete="off"
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                  <s-button
                    type="button"
                    variant="secondary"
                    onClick={() => setIsTiktokAuthModalOpen(false)}
                    {...(isSavingTiktokConfig ? { disabled: true } : {})}
                  >
                    取消
                  </s-button>
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={handleSaveTiktokConfig}
                    {...(isSavingTiktokConfig ? { disabled: true } : {})}
                  >
                    {isSavingTiktokConfig ? "保存中..." : "保存授权信息"}
                  </s-button>
                </div>
              </s-stack>
            </s-box>
          </div>
        </div>
      ) : null}

      {isMicrosoftAuthModalOpen ? (
        <div style={modalOverlayStyle} onClick={() => setIsMicrosoftAuthModalOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={modalCardStyle}>
            <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
              <s-stack direction="block" gap="base">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <strong>Microsoft Ads 授权信息</strong>
                  <s-badge tone={microsoftConfigured ? "success" : "critical"}>
                    {microsoftConfigured ? "已配置" : "未配置"}
                  </s-badge>
                </div>
                {microsoftClientIdMasked ? (
                  <s-paragraph>当前 Client ID：{microsoftClientIdMasked}</s-paragraph>
                ) : null}
                <s-box padding="small" borderWidth="base" borderRadius="base" background="subdued">
                  <s-stack direction="block" gap="small">
                    <s-unordered-list>
                      <s-list-item>
                        Client ID：在 Azure Portal 的应用注册（App registrations）中获取。
                      </s-list-item>
                      <s-list-item>
                        Client Secret：在同一应用的 Certificates & secrets 中创建并获取。
                      </s-list-item>
                      <s-list-item>
                        Developer Token：在 Microsoft Advertising 后台/API 管理页获取。
                      </s-list-item>
                      <s-list-item>
                        Customer ID：Microsoft Advertising 账户 ID（常见为数字字符串）。
                      </s-list-item>
                    </s-unordered-list>
                  </s-stack>
                </s-box>
                <s-text-field
                  label="Client ID"
                  value={microsoftClientId}
                  onChange={(e) => setMicrosoftClientId(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label="Client Secret"
                  value={microsoftClientSecret}
                  onChange={(e) => setMicrosoftClientSecret(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label="Developer Token"
                  value={microsoftDeveloperToken}
                  onChange={(e) => setMicrosoftDeveloperToken(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label="Customer ID"
                  value={microsoftCustomerId}
                  onChange={(e) => setMicrosoftCustomerId(e.currentTarget.value)}
                  autocomplete="off"
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                  <s-button
                    type="button"
                    variant="secondary"
                    onClick={() => setIsMicrosoftAuthModalOpen(false)}
                    {...(isSavingMicrosoftConfig ? { disabled: true } : {})}
                  >
                    取消
                  </s-button>
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={handleSaveMicrosoftConfig}
                    {...(isSavingMicrosoftConfig ? { disabled: true } : {})}
                  >
                    {isSavingMicrosoftConfig ? "保存中..." : "保存授权信息"}
                  </s-button>
                </div>
              </s-stack>
            </s-box>
          </div>
        </div>
      ) : null}

      {isSfAuthModalOpen ? (
        <div style={modalOverlayStyle} onClick={() => setIsSfAuthModalOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={modalCardStyle}>
            <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
              <s-stack direction="block" gap="base">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <strong>顺丰速运接口授权</strong>
                  <s-badge tone={sfConfigured ? "success" : "critical"}>
                    {sfConfigured ? "已配置" : "未配置"}
                  </s-badge>
                </div>
                <s-paragraph>
                  顺丰开放平台通常不是 OAuth 跳转授权，而是通过接口凭证接入。请填写顺丰顾客编码和校验码，月结账号可选。
                </s-paragraph>
                <s-box padding="small" borderWidth="base" borderRadius="base" background="subdued">
                  <s-stack direction="block" gap="small">
                    <s-unordered-list>
                      <s-list-item>
                        顾客编码（Customer Code）：在顺丰开放平台或电子运单 API 对接资料中获取。
                      </s-list-item>
                      <s-list-item>
                        校验码（Check Word）：由顺丰开放平台提供，通常与顾客编码配套下发。
                      </s-list-item>
                      <s-list-item>
                        月结账号：来自顺丰月结客户资料（无月结可先留空）。
                      </s-list-item>
                      <s-list-item>
                        如果不确定字段值，可联系顺丰商务/技术支持按企业信息协助开通并提供参数。
                      </s-list-item>
                    </s-unordered-list>
                  </s-stack>
                </s-box>
                {sfCustomerCodeMasked ? (
                  <s-paragraph>当前顾客编码：{sfCustomerCodeMasked}</s-paragraph>
                ) : null}
                <s-text-field
                  label="顺丰顾客编码（Customer Code）"
                  value={sfCustomerCode}
                  onChange={(e) => setSfCustomerCode(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label="顺丰校验码（Check Word）"
                  value={sfCheckWord}
                  onChange={(e) => setSfCheckWord(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label="顺丰月结账号（可选）"
                  value={sfMonthlyAccount}
                  onChange={(e) => setSfMonthlyAccount(e.currentTarget.value)}
                  autocomplete="off"
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                  <s-button
                    type="button"
                    variant="secondary"
                    onClick={() => setIsSfAuthModalOpen(false)}
                    {...(isSavingSfConfig ? { disabled: true } : {})}
                  >
                    取消
                  </s-button>
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={handleSaveSfConfig}
                    {...(isSavingSfConfig ? { disabled: true } : {})}
                  >
                    {isSavingSfConfig ? "保存中..." : "保存授权信息"}
                  </s-button>
                </div>
              </s-stack>
            </s-box>
          </div>
        </div>
      ) : null}

      {isFedexAuthModalOpen ? (
        <div style={modalOverlayStyle} onClick={() => setIsFedexAuthModalOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={modalCardStyle}>
            <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
              <s-stack direction="block" gap="base">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <strong>FedEx 接口授权</strong>
                  <s-badge tone={fedexConfigured ? "success" : "critical"}>
                    {fedexConfigured ? "已配置" : "未配置"}
                  </s-badge>
                </div>
                <s-paragraph>
                  FedEx 为 API 凭证接入模式。请填写 API Key、Secret Key 和 Account Number；Meter Number 按你的账户情况选填。
                </s-paragraph>
                <s-box padding="small" borderWidth="base" borderRadius="base" background="subdued">
                  <s-stack direction="block" gap="small">
                    <s-unordered-list>
                      <s-list-item>
                        API Key：在 FedEx Developer Portal 创建项目后生成。
                      </s-list-item>
                      <s-list-item>
                        Secret Key：与 API Key 同一页面生成并配套使用。
                      </s-list-item>
                      <s-list-item>
                        Account Number：来自 FedEx 账号资料页面（通常为数字字符串）。
                      </s-list-item>
                      <s-list-item>
                        Meter Number：可在 FedEx Web Services 历史接入资料中查询（没有可先留空）。
                      </s-list-item>
                    </s-unordered-list>
                  </s-stack>
                </s-box>
                {fedexAccountNumberMasked ? (
                  <s-paragraph>当前账号：{fedexAccountNumberMasked}</s-paragraph>
                ) : null}
                <s-text-field
                  label="API Key"
                  value={fedexApiKey}
                  onChange={(e) => setFedexApiKey(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label="Secret Key"
                  value={fedexSecretKey}
                  onChange={(e) => setFedexSecretKey(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label="Account Number"
                  value={fedexAccountNumber}
                  onChange={(e) => setFedexAccountNumber(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label="Meter Number（可选）"
                  value={fedexMeterNumber}
                  onChange={(e) => setFedexMeterNumber(e.currentTarget.value)}
                  autocomplete="off"
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                  <s-button
                    type="button"
                    variant="secondary"
                    onClick={() => setIsFedexAuthModalOpen(false)}
                    {...(isSavingFedexConfig ? { disabled: true } : {})}
                  >
                    取消
                  </s-button>
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={handleSaveFedexConfig}
                    {...(isSavingFedexConfig ? { disabled: true } : {})}
                  >
                    {isSavingFedexConfig ? "保存中..." : "保存授权信息"}
                  </s-button>
                </div>
              </s-stack>
            </s-box>
          </div>
        </div>
      ) : null}

      {isSuggestionModalOpen ? (
        <div style={modalOverlayStyle} onClick={() => setIsSuggestionModalOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={modalCardStyle}>
            <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
              <s-stack direction="block" gap="base">
                <strong>提交建议</strong>
                <s-paragraph>请输入你希望 assistant 新增的功能描述。</s-paragraph>
                <s-text-field
                  label="建议描述"
                  value={suggestionText}
                  onChange={(e) => setSuggestionText(e.currentTarget.value)}
                  autocomplete="off"
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                  <s-button
                    type="button"
                    variant="secondary"
                    onClick={() => setIsSuggestionModalOpen(false)}
                    {...(isSubmittingSuggestion ? { disabled: true } : {})}
                  >
                    取消
                  </s-button>
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={handleSubmitSuggestion}
                    {...(isSubmittingSuggestion || !suggestionText.trim()
                      ? { disabled: true }
                      : {})}
                  >
                    {isSubmittingSuggestion ? "提交中..." : "提交"}
                  </s-button>
                </div>
              </s-stack>
            </s-box>
          </div>
        </div>
      ) : null}
    </s-page>
  );
}
