import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  adProviders,
  logisticsProviders,
  type ProviderItem,
} from "./chatPageConstants";
import { pageColorTokens } from "../pageUiStyles";

type ShopifyToast = {
  toast: { show: (message: string) => void };
};

export function useChatPageCredentials(shopify: ShopifyToast) {
  const { t } = useTranslation();
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [googleDeveloperTokenMasked, setGoogleDeveloperTokenMasked] = useState("");
  const [googleDeveloperToken, setGoogleDeveloperToken] = useState("");
  const [googleCustomerId, setGoogleCustomerId] = useState("");
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [googleClientIdMasked, setGoogleClientIdMasked] = useState("");
  const [googleClientSecretMasked, setGoogleClientSecretMasked] = useState("");
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
  const [microsoftDeveloperTokenMasked, setMicrosoftDeveloperTokenMasked] =
    useState("");
  const [microsoftDeveloperToken, setMicrosoftDeveloperToken] = useState("");
  const [microsoftCustomerId, setMicrosoftCustomerId] = useState("");
  const [microsoftConfigured, setMicrosoftConfigured] = useState(false);
  const [microsoftClientIdMasked, setMicrosoftClientIdMasked] = useState("");
  const [microsoftClientSecretMasked, setMicrosoftClientSecretMasked] =
    useState("");
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.location.search;
    fetch(`/app/ads/google/config${query}`)
      .then((res) => res.json())
      .then(
        (data: {
          configured?: boolean;
          clientIdMasked?: string;
          clientSecretMasked?: string;
          developerTokenMasked?: string;
          customerId?: string;
        }) => {
          setGoogleConfigured(Boolean(data.configured));
          setGoogleClientIdMasked(data.clientIdMasked ?? "");
          setGoogleClientSecretMasked(data.clientSecretMasked ?? "");
          setGoogleDeveloperTokenMasked(data.developerTokenMasked ?? "");
          setGoogleClientId(data.clientIdMasked ?? "");
          setGoogleClientSecret(data.clientSecretMasked ?? "");
          setGoogleDeveloperToken(data.developerTokenMasked ?? "");
          setGoogleCustomerId(data.customerId ?? "");
        },
      )
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
      .then(
        (data: {
          configured?: boolean;
          clientIdMasked?: string;
          clientSecretMasked?: string;
          developerTokenMasked?: string;
          customerId?: string;
        }) => {
          setMicrosoftConfigured(Boolean(data.configured));
          setMicrosoftClientIdMasked(data.clientIdMasked ?? "");
          setMicrosoftClientSecretMasked(data.clientSecretMasked ?? "");
          setMicrosoftDeveloperTokenMasked(data.developerTokenMasked ?? "");
          setMicrosoftClientId(data.clientIdMasked ?? "");
          setMicrosoftClientSecret(data.clientSecretMasked ?? "");
          setMicrosoftDeveloperToken(data.developerTokenMasked ?? "");
          setMicrosoftCustomerId(data.customerId ?? "");
        },
      )
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

  const handleAuthorizeProvider = (provider: ProviderItem, category: "ads" | "logistics") => {
    if (category === "ads" && provider.id === "google") {
      setIsGoogleAuthModalOpen(true);
      return;
    }
    if (category === "ads" && provider.id === "tiktok") {
      setIsTiktokAuthModalOpen(true);
      return;
    }
    if (category === "ads" && provider.id === "microsoft") {
      setIsMicrosoftAuthModalOpen(true);
      return;
    }
    if (provider.id === "sf" && category === "logistics") {
      setIsSfAuthModalOpen(true);
      return;
    }
    if (provider.id === "fedex" && category === "logistics") {
      setIsFedexAuthModalOpen(true);
      return;
    }
    shopify.toast.show(
      t("credentials.oauthPending", {
        provider: t(provider.name),
        category: category === "ads" ? t("credentials.categoryAds") : t("credentials.categoryLogistics"),
      }),
    );
  };

  const handleSaveGoogleConfig = async () => {
    const clientId = googleClientId.trim();
    const clientSecret = googleClientSecret.trim();
    const developerToken = googleDeveloperToken.trim();
    const customerId = googleCustomerId.trim();
    if (!clientId || !clientSecret || !developerToken || !customerId) {
      shopify.toast.show(t("credentials.googleRequireAll"));
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
        clientSecretMasked?: string;
        developerTokenMasked?: string;
        customerId?: string;
      };
      if (!response.ok || !data.ok) {
        shopify.toast.show(data.error || t("credentials.saveFailed", { status: response.status }));
        return;
      }

      setGoogleConfigured(Boolean(data.configured));
      setGoogleClientIdMasked(data.clientIdMasked ?? "");
      setGoogleClientSecretMasked(data.clientSecretMasked ?? "");
      setGoogleDeveloperTokenMasked(data.developerTokenMasked ?? "");
      setGoogleClientId(data.clientIdMasked ?? "");
      setGoogleClientSecret(data.clientSecretMasked ?? "");
      setGoogleDeveloperToken(data.developerTokenMasked ?? "");
      setGoogleCustomerId(data.customerId ?? customerId);
      setIsGoogleAuthModalOpen(false);
      shopify.toast.show(t("credentials.googleSaveOk"));
    } catch {
      shopify.toast.show(t("credentials.googleSaveFail"));
    } finally {
      setIsSavingGoogleConfig(false);
    }
  };

  const handleSaveTiktokConfig = async () => {
    const appId = tiktokAppId.trim();
    const appSecret = tiktokAppSecret.trim();
    const advertiserId = tiktokAdvertiserId.trim();
    if (!appId || !appSecret || !advertiserId) {
      shopify.toast.show(t("credentials.tiktokRequireAll"));
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
        shopify.toast.show(data.error || t("credentials.saveFailed", { status: response.status }));
        return;
      }

      setTiktokConfigured(Boolean(data.configured));
      setTiktokAppIdMasked(data.appIdMasked ?? "");
      setTiktokAppSecret("");
      setIsTiktokAuthModalOpen(false);
      shopify.toast.show(t("credentials.tiktokSaveOk"));
    } catch {
      shopify.toast.show(t("credentials.tiktokSaveFail"));
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
      shopify.toast.show(t("credentials.microsoftRequireAll"));
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
        clientSecretMasked?: string;
        developerTokenMasked?: string;
        customerId?: string;
      };
      if (!response.ok || !data.ok) {
        shopify.toast.show(data.error || t("credentials.saveFailed", { status: response.status }));
        return;
      }

      setMicrosoftConfigured(Boolean(data.configured));
      setMicrosoftClientIdMasked(data.clientIdMasked ?? "");
      setMicrosoftClientSecretMasked(data.clientSecretMasked ?? "");
      setMicrosoftDeveloperTokenMasked(data.developerTokenMasked ?? "");
      setMicrosoftClientId(data.clientIdMasked ?? "");
      setMicrosoftClientSecret(data.clientSecretMasked ?? "");
      setMicrosoftDeveloperToken(data.developerTokenMasked ?? "");
      setMicrosoftCustomerId(data.customerId ?? customerId);
      setIsMicrosoftAuthModalOpen(false);
      shopify.toast.show(t("credentials.microsoftSaveOk"));
    } catch {
      shopify.toast.show(t("credentials.microsoftSaveFail"));
    } finally {
      setIsSavingMicrosoftConfig(false);
    }
  };

  const handleSaveSfConfig = async () => {
    const customerCode = sfCustomerCode.trim();
    const checkWord = sfCheckWord.trim();
    const monthlyAccount = sfMonthlyAccount.trim();

    if (!customerCode || !checkWord) {
      shopify.toast.show(t("credentials.sfRequireAll"));
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
        shopify.toast.show(data.error || t("credentials.saveFailed", { status: response.status }));
        return;
      }

      setSfConfigured(Boolean(data.configured));
      setSfCustomerCodeMasked(data.customerCodeMasked ?? "");
      setSfCheckWord("");
      setIsSfAuthModalOpen(false);
      shopify.toast.show(t("credentials.sfSaveOk"));
    } catch {
      shopify.toast.show(t("credentials.sfSaveFail"));
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
      shopify.toast.show(t("credentials.fedexRequireAll"));
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
        shopify.toast.show(data.error || t("credentials.saveFailed", { status: response.status }));
        return;
      }

      setFedexConfigured(Boolean(data.configured));
      setFedexAccountNumberMasked(data.accountNumberMasked ?? "");
      setFedexSecretKey("");
      setIsFedexAuthModalOpen(false);
      shopify.toast.show(t("credentials.fedexSaveOk"));
    } catch {
      shopify.toast.show(t("credentials.fedexSaveFail"));
    } finally {
      setIsSavingFedexConfig(false);
    }
  };

  const handleSubmitSuggestion = async () => {
    const content = suggestionText.trim();
    if (!content) {
      shopify.toast.show(t("credentials.suggestionEmpty"));
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
        shopify.toast.show(data.error || t("credentials.suggestionSubmitFail", { status: response.status }));
        return;
      }
      setSuggestionText("");
      setIsSuggestionModalOpen(false);
      shopify.toast.show(data.message || t("credentials.suggestionSubmitOk"));
    } catch {
      shopify.toast.show(t("credentials.suggestionSubmitCatch"));
    } finally {
      setIsSubmittingSuggestion(false);
    }
  };

  const renderProviderRows = (providers: ProviderItem[], category: "ads" | "logistics") => {
    const isConfigured = (providerId: string) => {
      if (category === "logistics" && providerId === "sf") return sfConfigured;
      if (category === "logistics" && providerId === "fedex") return fedexConfigured;
      if (category === "ads" && providerId === "google") return googleConfigured;
      if (category === "ads" && providerId === "tiktok") return tiktokConfigured;
      if (category === "ads" && providerId === "microsoft") return microsoftConfigured;
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
              borderBottom:
                index < providers.length - 1
                  ? `1px solid ${pageColorTokens.divider}`
                  : "none",
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
              {t(provider.name)}
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
                  {isConfigured(provider.id) ? t("credentials.configured") : t("credentials.unauthorized")}
                </s-badge>
              </span>
              <s-button
                type="button"
                variant="secondary"
                onClick={() => handleAuthorizeProvider(provider, category)}
              >
                {t("credentials.authorizeNow")}
              </s-button>
            </div>
          </div>
        ))}
      </s-stack>
    );
  };

  return {
    adProviders,
    logisticsProviders,
    renderProviderRows,
    handleSaveGoogleConfig,
    handleSaveTiktokConfig,
    handleSaveMicrosoftConfig,
    handleSaveSfConfig,
    handleSaveFedexConfig,
    handleSubmitSuggestion,
    isGoogleAuthModalOpen,
    setIsGoogleAuthModalOpen,
    googleConfigured,
    googleClientIdMasked,
    googleClientSecretMasked,
    googleDeveloperTokenMasked,
    googleClientId,
    setGoogleClientId,
    googleClientSecret,
    setGoogleClientSecret,
    googleDeveloperToken,
    setGoogleDeveloperToken,
    googleCustomerId,
    setGoogleCustomerId,
    isSavingGoogleConfig,
    isTiktokAuthModalOpen,
    setIsTiktokAuthModalOpen,
    tiktokConfigured,
    tiktokAppIdMasked,
    tiktokAppId,
    setTiktokAppId,
    tiktokAppSecret,
    setTiktokAppSecret,
    tiktokAdvertiserId,
    setTiktokAdvertiserId,
    isSavingTiktokConfig,
    isMicrosoftAuthModalOpen,
    setIsMicrosoftAuthModalOpen,
    microsoftConfigured,
    microsoftClientIdMasked,
    microsoftClientSecretMasked,
    microsoftDeveloperTokenMasked,
    microsoftClientId,
    setMicrosoftClientId,
    microsoftClientSecret,
    setMicrosoftClientSecret,
    microsoftDeveloperToken,
    setMicrosoftDeveloperToken,
    microsoftCustomerId,
    setMicrosoftCustomerId,
    isSavingMicrosoftConfig,
    isSfAuthModalOpen,
    setIsSfAuthModalOpen,
    sfConfigured,
    sfCustomerCodeMasked,
    sfCustomerCode,
    setSfCustomerCode,
    sfCheckWord,
    setSfCheckWord,
    sfMonthlyAccount,
    setSfMonthlyAccount,
    isSavingSfConfig,
    isFedexAuthModalOpen,
    setIsFedexAuthModalOpen,
    fedexConfigured,
    fedexAccountNumberMasked,
    fedexApiKey,
    setFedexApiKey,
    fedexSecretKey,
    setFedexSecretKey,
    fedexAccountNumber,
    setFedexAccountNumber,
    fedexMeterNumber,
    setFedexMeterNumber,
    isSavingFedexConfig,
    isSuggestionModalOpen,
    setIsSuggestionModalOpen,
    suggestionText,
    setSuggestionText,
    isSubmittingSuggestion,
  };
}

export type ChatPageCredentialsVm = ReturnType<typeof useChatPageCredentials>;
