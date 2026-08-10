import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens, pageHintTextStyle } from "../../page/pageUiStyles";
import {
  buildMetaEventsManagerTestUrl,
  buildMetaEventsManagerUrl,
  buildMetaPixelThemeEditorUrl,
  buildMetaShopOnlineStoreUrl,
  META_PIXEL_DEFAULT_EVENTS,
  META_PIXEL_OPTIONAL_EVENTS,
  type MetaPixelEventName,
} from "../../../lib/metaPixelEvents";

type Props = {
  locationSearch: string;
  shopDomain: string;
  shopifyApiKey: string;
  pixelId: string;
  hasCapiAccessToken: boolean;
  testEventCode: string;
  capiEnabled: boolean;
  enabledEvents: string[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  onChanged: () => void;
};

const inputStyle = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 8,
  border: `1px solid ${pageColorTokens.borderInput}`,
  fontSize: 13,
  boxSizing: "border-box" as const,
};

const secondaryBtn = {
  padding: "8px 12px",
  borderRadius: 8,
  background: "#fff",
  color: pageColorTokens.textPrimary,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const primaryBtn = {
  ...secondaryBtn,
  background: "#010101",
  color: "#fff",
  border: "none",
};

const fieldLabelStyle = { fontSize: 13, fontWeight: 600 };

const EVENT_LABEL_KEY: Record<string, string> = {
  ViewContent: "metaPixelEventViewContent",
  AddToCart: "metaPixelEventAddToCart",
  InitiateCheckout: "metaPixelEventInitiateCheckout",
  Purchase: "metaPixelEventPurchase",
  PageView: "metaPixelEventPageView",
  Search: "metaPixelEventSearch",
};

export function MetaPixelConfigPanel({
  locationSearch,
  shopDomain,
  shopifyApiKey,
  pixelId,
  hasCapiAccessToken,
  testEventCode: savedTestEventCode,
  capiEnabled: initialCapiEnabled,
  enabledEvents: initialEnabledEvents,
  busy,
  setBusy,
  onChanged,
}: Props) {
  const { t } = useTranslation();
  const [pixelIdInput, setPixelIdInput] = useState(pixelId);
  const [capiEnabled, setCapiEnabled] = useState(initialCapiEnabled);
  const [tokenInput, setTokenInput] = useState("");
  const [testEventCode, setTestEventCode] = useState(savedTestEventCode);
  const [enabledEvents, setEnabledEvents] = useState<string[]>(
    initialEnabledEvents.length ? initialEnabledEvents : [...META_PIXEL_DEFAULT_EVENTS],
  );
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const [testModeStarted, setTestModeStarted] = useState(false);
  const [testCleared, setTestCleared] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  function openExternal(url: string | null) {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  useEffect(() => {
    setPixelIdInput(pixelId);
  }, [pixelId]);

  useEffect(() => {
    setCapiEnabled(initialCapiEnabled);
  }, [initialCapiEnabled]);

  useEffect(() => {
    setTestEventCode(savedTestEventCode);
  }, [savedTestEventCode]);

  useEffect(() => {
    setEnabledEvents(
      initialEnabledEvents.length ? initialEnabledEvents : [...META_PIXEL_DEFAULT_EVENTS],
    );
  }, [initialEnabledEvents]);

  function toggleEvent(name: MetaPixelEventName) {
    setEnabledEvents((prev) =>
      prev.includes(name) ? prev.filter((e) => e !== name) : [...prev, name],
    );
  }

  async function saveConfig() {
    setBusy(true);
    setSaveSuccess(false);
    setTestSuccess(false);
    setLocalError(null);
    try {
      if (!pixelIdInput.trim()) {
        setLocalError(t("adsCatalog.metaPixelIdRequired"));
        return;
      }
      if (!tokenInput.trim() && !hasCapiAccessToken) {
        setLocalError(t("adsCatalog.metaPixelTokenRequired"));
        return;
      }

      const body: Record<string, unknown> = {
        pixelId: pixelIdInput.trim(),
        capiEnabled,
        enabledEvents,
      };
      if (tokenInput.trim()) body.capiAccessToken = tokenInput.trim();

      const resp = await fetch(`/api/ads-catalog/meta-pixel-config${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!resp.ok || !data.ok) {
        setLocalError(data.error ?? t("adsCatalog.authError"));
        return;
      }
      setTokenInput("");
      setSaveSuccess(true);
      onChanged();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : t("adsCatalog.authError"));
    } finally {
      setBusy(false);
    }
  }

  async function saveTestEventCode() {
    const code = testEventCode.trim();
    if (!code) {
      setTestError(t("adsCatalog.metaPixelTestEventCodeRequired"));
      return;
    }
    if (!pixelId && !pixelIdInput.trim()) {
      setTestError(t("adsCatalog.metaPixelIdRequired"));
      return;
    }

    setBusy(true);
    setTestSuccess(false);
    setTestCleared(false);
    setTestModeStarted(false);
    setTestError(null);
    try {
      const resp = await fetch(`/api/ads-catalog/meta-test-events${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", testEventCode: code }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!resp.ok || !data.ok) {
        setTestError(data.error ?? t("adsCatalog.authError"));
        return;
      }
      setTestModeStarted(true);
      onChanged();
    } catch (e) {
      setTestError(e instanceof Error ? e.message : t("adsCatalog.authError"));
    } finally {
      setBusy(false);
    }
  }

  async function clearTestEventConnection() {
    setBusy(true);
    setTestSuccess(false);
    setTestModeStarted(false);
    setTestError(null);
    try {
      const resp = await fetch(`/api/ads-catalog/meta-test-events${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear" }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!resp.ok || !data.ok) {
        setTestError(data.error ?? t("adsCatalog.authError"));
        return;
      }
      setTestEventCode("");
      setTestCleared(true);
      onChanged();
      const clearUrl = buildMetaShopOnlineStoreUrl(shopDomain, { testEventCode: "" });
      if (clearUrl) openExternal(clearUrl);
    } catch (e) {
      setTestError(e instanceof Error ? e.message : t("adsCatalog.authError"));
    } finally {
      setBusy(false);
    }
  }

  async function testServerEvents() {
    setBusy(true);
    setTestSuccess(false);
    setTestModeStarted(false);
    setTestCleared(false);
    setTestError(null);
    try {
      if (!testEventCode.trim()) {
        setTestError(t("adsCatalog.metaPixelTestEventCodeRequired"));
        return;
      }
      if (!hasCapiAccessToken && !tokenInput.trim()) {
        setTestError(t("adsCatalog.metaPixelTokenRequired"));
        return;
      }
      if (!pixelId && !pixelIdInput.trim()) {
        setTestError(t("adsCatalog.metaPixelIdRequired"));
        return;
      }

      const body: Record<string, unknown> = {
        action: "send",
        testEventCode: testEventCode.trim(),
      };
      if (tokenInput.trim()) body.capiAccessToken = tokenInput.trim();
      if (pixelIdInput.trim()) body.pixelId = pixelIdInput.trim();

      const resp = await fetch(`/api/ads-catalog/meta-test-events${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!resp.ok || !data.ok) {
        setTestError(data.error ?? t("adsCatalog.authError"));
        return;
      }
      setTestSuccess(true);
    } catch (e) {
      setTestError(e instanceof Error ? e.message : t("adsCatalog.authError"));
    } finally {
      setBusy(false);
    }
  }

  const eventsManagerUrl = buildMetaEventsManagerUrl(pixelIdInput || pixelId);
  const testEventHowToUrl = buildMetaEventsManagerTestUrl(pixelIdInput || pixelId);
  const themeEditorUrl = buildMetaPixelThemeEditorUrl({
    shopDomain,
    apiKey: shopifyApiKey,
  });
  const onlineStoreUrl = buildMetaShopOnlineStoreUrl(shopDomain);

  const canSave =
    !busy &&
    Boolean(pixelIdInput.trim()) &&
    (Boolean(tokenInput.trim()) || hasCapiAccessToken) &&
    enabledEvents.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>
        {t("adsCatalog.metaPixelSectionTitle")}
      </div>
      {pixelId ? (
        <div style={{ color: "#0f7a52", fontSize: 13 }}>
          {t("adsCatalog.metaPixelIdLabel", { id: pixelId })}
        </div>
      ) : null}
      <p style={{ ...pageHintTextStyle, margin: 0 }}>
        {t("adsCatalog.metaPixelConfigHint")}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={fieldLabelStyle}>{t("adsCatalog.metaPixelIdFieldLabel")}</label>
        <input
          style={inputStyle}
          value={pixelIdInput}
          disabled={busy}
          placeholder={t("adsCatalog.metaPixelIdPlaceholder")}
          onChange={(e) => setPixelIdInput(e.target.value)}
        />
      </div>

      <div
        style={{
          border: `1px solid ${pageColorTokens.border}`,
          borderRadius: 8,
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          background: pageColorTokens.surfaceSubtle,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            {t("adsCatalog.metaPixelServerSideTitle")}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#b98900",
              background: "#fff5d6",
              padding: "2px 6px",
              borderRadius: 4,
            }}
          >
            {t("adsCatalog.metaPixelRequiredBadge")}
          </span>
        </div>
        <p style={{ ...pageHintTextStyle, margin: 0 }}>
          {t("adsCatalog.metaPixelServerSideHint")}
        </p>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={capiEnabled}
            disabled={busy}
            onChange={(e) => setCapiEnabled(e.target.checked)}
          />
          {t("adsCatalog.metaPixelCapiEnable")}
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <label style={fieldLabelStyle}>{t("adsCatalog.metaPixelAccessTokenLabel")}</label>
            <a
              href={eventsManagerUrl}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12, color: "#005bd3" }}
            >
              {t("adsCatalog.metaPixelHowToGetToken")}
            </a>
          </div>
          <input
            style={inputStyle}
            type="password"
            autoComplete="off"
            value={tokenInput}
            disabled={busy}
            placeholder={
              hasCapiAccessToken
                ? t("adsCatalog.metaPixelAccessTokenConfigured")
                : t("adsCatalog.metaPixelAccessTokenPlaceholder")
            }
            onChange={(e) => setTokenInput(e.target.value)}
          />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{t("adsCatalog.metaPixelEventsTitle")}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {META_PIXEL_DEFAULT_EVENTS.map((name) => (
            <label
              key={name}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={enabledEvents.includes(name)}
                disabled={busy}
                onChange={() => toggleEvent(name)}
              />
              {t(`adsCatalog.${EVENT_LABEL_KEY[name]}`)}
            </label>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {META_PIXEL_OPTIONAL_EVENTS.map((name) => (
            <label
              key={name}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={enabledEvents.includes(name)}
                disabled={busy}
                onChange={() => toggleEvent(name)}
              />
              {t(`adsCatalog.${EVENT_LABEL_KEY[name]}`)}
            </label>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={primaryBtn} disabled={!canSave} onClick={() => void saveConfig()}>
          {busy ? t("adsCatalog.metaPixelSaveBusy") : t("adsCatalog.metaPixelSave")}
        </button>
        {saveSuccess && (
          <span style={{ color: "#0f7a52", fontSize: 12 }}>{t("adsCatalog.metaPixelSaveSuccess")}</span>
        )}
        {localError && <span style={{ color: "#d72c0d", fontSize: 12 }}>{localError}</span>}
      </div>

      <div
        style={{
          border: `1px solid ${pageColorTokens.border}`,
          borderRadius: 8,
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          background: pageColorTokens.surfaceSubtle,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700 }}>{t("adsCatalog.metaPixelTestSectionTitle")}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            style={{ ...inputStyle, flex: 1, minWidth: 160 }}
            value={testEventCode}
            disabled={busy}
            placeholder={t("adsCatalog.metaPixelTestEventCodePlaceholder")}
            onChange={(e) => {
              setTestEventCode(e.target.value);
              setTestSuccess(false);
              setTestModeStarted(false);
              setTestCleared(false);
              setTestError(null);
            }}
          />
          <button
            type="button"
            style={{ ...primaryBtn, padding: "8px 10px", whiteSpace: "nowrap" }}
            disabled={busy || !testEventCode.trim()}
            onClick={() => void saveTestEventCode()}
          >
            {t("adsCatalog.metaPixelSaveTestEventCode")}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            style={{ ...secondaryBtn, padding: "4px 8px" }}
            disabled={busy}
            onClick={() => void testServerEvents()}
          >
            {busy ? t("adsCatalog.metaPixelTestServerEventsBusy") : t("adsCatalog.metaPixelTestServerEvents")}
          </button>
          <button
            type="button"
            style={{
              ...secondaryBtn,
              padding: "4px 8px",
              color: "#d72c0d",
              borderColor: "#f1b6ab",
            }}
            disabled={busy}
            onClick={() => void clearTestEventConnection()}
          >
            {t("adsCatalog.metaPixelCancelTestConnection")}
          </button>
          <button
            type="button"
            style={{ ...secondaryBtn, padding: "4px 8px" }}
            disabled={!onlineStoreUrl}
            onClick={() => openExternal(onlineStoreUrl)}
          >
            {t("adsCatalog.metaPixelOpenStorefront")}
          </button>
        </div>
        {testError && <span style={{ color: "#d72c0d", fontSize: 12 }}>{testError}</span>}
        {testSuccess && (
          <span style={{ color: "#0f7a52", fontSize: 12 }}>
            {t("adsCatalog.metaPixelTestServerEventsSuccess")}
          </span>
        )}
        {testModeStarted && (
          <span style={{ color: "#0f7a52", fontSize: 12 }}>
            {t("adsCatalog.metaPixelTestModeStarted")}
          </span>
        )}
        {testCleared && (
          <span style={{ color: "#0f7a52", fontSize: 12 }}>
            {t("adsCatalog.metaPixelCancelTestDone")}
          </span>
        )}
        <a
          href={testEventHowToUrl}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 12, color: "#005bd3" }}
        >
          {t("adsCatalog.metaPixelHowToGetTestEventCode")}
        </a>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          padding: "10px 12px",
          borderRadius: 8,
          background: "#fff",
          border: `1px solid ${pageColorTokens.borderSubtle}`,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {t("adsCatalog.metaPixelAppThemeTitle")}
          </span>
          <span style={{ ...pageHintTextStyle, margin: 0 }}>
            {t("adsCatalog.metaPixelAppThemeHint")}
          </span>
        </div>
        <button
          type="button"
          style={{
            ...secondaryBtn,
            padding: "8px 14px",
            whiteSpace: "nowrap",
            opacity: themeEditorUrl ? 1 : 0.5,
            cursor: themeEditorUrl ? "pointer" : "not-allowed",
          }}
          disabled={!themeEditorUrl}
          onClick={() => openExternal(themeEditorUrl)}
        >
          {t("adsCatalog.metaPixelOpenThemeEditor")}
        </button>
      </div>
    </div>
  );
}
