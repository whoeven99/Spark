import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOAuthPopup } from "../../../hooks/useOAuthPopup";
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

type PixelListItem = {
  pixelId: string;
  pixelName: string;
};

type AdAccountItem = {
  id: string;
  name?: string;
  formatted?: string;
};

type Props = {
  locationSearch: string;
  shopDomain: string;
  shopifyApiKey: string;
  pixelId: string;
  hasCapiAccessToken: boolean;
  hasStoredCapiAccessToken: boolean;
  metaOAuthCapiAvailable: boolean;
  testEventCode: string;
  capiEnabled: boolean;
  enabledEvents: string[];
  metaAdsConnected: boolean;
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

function withAdAccountQuery(locationSearch: string, adAccountId: string): string {
  const params = new URLSearchParams(
    locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch,
  );
  if (adAccountId) params.set("adAccountId", adAccountId);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function MetaPixelConfigPanel({
  locationSearch,
  shopDomain,
  shopifyApiKey,
  pixelId,
  hasCapiAccessToken,
  hasStoredCapiAccessToken,
  metaOAuthCapiAvailable,
  testEventCode: savedTestEventCode,
  capiEnabled: initialCapiEnabled,
  enabledEvents: initialEnabledEvents,
  metaAdsConnected,
  busy,
  setBusy,
  onChanged,
}: Props) {
  const { t } = useTranslation();
  const metaAdsOAuth = useOAuthPopup("meta_ads_oauth");

  const [mode, setMode] = useState<"select" | "manual">(pixelId ? "select" : "select");
  const [adAccounts, setAdAccounts] = useState<AdAccountItem[]>([]);
  const [selectedAdAccountId, setSelectedAdAccountId] = useState("");
  const [pixels, setPixels] = useState<PixelListItem[]>([]);
  const [pixelsLoading, setPixelsLoading] = useState(false);
  const [needsMetaAdsConnect, setNeedsMetaAdsConnect] = useState(false);
  const [pixelIdInput, setPixelIdInput] = useState(pixelId);
  const [selectedPixelId, setSelectedPixelId] = useState(pixelId);
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
    setSelectedPixelId(pixelId);
    if (pixelId) setMode("select");
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setPixelsLoading(true);
      try {
        const qs = withAdAccountQuery(locationSearch, selectedAdAccountId);
        const resp = await fetch(`/api/ads-catalog/meta-pixels${qs}`, {
          headers: { Accept: "application/json" },
        });
        const data = (await resp.json().catch(() => ({}))) as {
          ok?: boolean;
          pixels?: PixelListItem[];
          adAccounts?: AdAccountItem[];
          adAccountId?: string;
          needsMetaAdsConnect?: boolean;
          listError?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!resp.ok || !data.ok) {
          setLocalError(data.error ?? t("adsCatalog.authError"));
          setPixels([]);
          setNeedsMetaAdsConnect(false);
          return;
        }
        setAdAccounts(data.adAccounts ?? []);
        if (data.adAccountId && !selectedAdAccountId) {
          setSelectedAdAccountId(data.adAccountId);
        }
        const nextPixels = data.pixels ?? [];
        setPixels(nextPixels);
        setNeedsMetaAdsConnect(Boolean(data.needsMetaAdsConnect));
        setLocalError(null);

        if (mode === "select") {
          const preferId = selectedPixelId || pixelId;
          const matched = nextPixels.find((p) => p.pixelId === preferId);
          if (matched) {
            setSelectedPixelId(matched.pixelId);
            setPixelIdInput(matched.pixelId);
          } else if (
            selectedPixelId &&
            !nextPixels.some((p) => p.pixelId === selectedPixelId)
          ) {
            setSelectedPixelId("");
          }
        }
      } catch (e) {
        if (!cancelled) {
          setLocalError(e instanceof Error ? e.message : t("adsCatalog.authError"));
          setPixels([]);
        }
      } finally {
        if (!cancelled) setPixelsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when account or mode changes
  }, [mode, locationSearch, selectedAdAccountId, t, pixelId]);

  function toggleEvent(name: MetaPixelEventName) {
    setEnabledEvents((prev) =>
      prev.includes(name) ? prev.filter((e) => e !== name) : [...prev, name],
    );
  }

  function onSelectPixel(id: string) {
    setSelectedPixelId(id);
    setPixelIdInput(id);
  }

  function switchToSelect() {
    setMode("select");
    setSaveSuccess(false);
    setLocalError(null);
  }

  function switchToManual() {
    setMode("manual");
    setSaveSuccess(false);
    setLocalError(null);
  }

  function connectMetaAds() {
    void (async () => {
      setBusy(true);
      try {
        await metaAdsOAuth.startOAuth(
          `/api/ads-insights/meta-auth-url${locationSearch}`,
          () => onChanged(),
        );
      } catch (e) {
        setLocalError(e instanceof Error ? e.message : t("adsCatalog.authError"));
      } finally {
        setBusy(false);
      }
    })();
  }

  async function saveConfig() {
    setBusy(true);
    setSaveSuccess(false);
    setTestSuccess(false);
    setLocalError(null);
    try {
      const idToSave = mode === "select" ? selectedPixelId.trim() : pixelIdInput.trim();
      if (!idToSave) {
        setLocalError(
          mode === "select"
            ? t("adsCatalog.metaPixelSelectRequired")
            : t("adsCatalog.metaPixelIdRequired"),
        );
        return;
      }
      if (
        capiEnabled &&
        !tokenInput.trim() &&
        !hasCapiAccessToken &&
        !(mode === "select" && metaOAuthCapiAvailable)
      ) {
        setLocalError(t("adsCatalog.metaPixelTokenRequired"));
        return;
      }

      const body: Record<string, unknown> = {
        pixelId: idToSave,
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
    const activePixelId = selectedPixelId || pixelIdInput || pixelId;
    if (!activePixelId.trim()) {
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
      const activePixelId = selectedPixelId || pixelIdInput || pixelId;
      if (!activePixelId.trim()) {
        setTestError(t("adsCatalog.metaPixelIdRequired"));
        return;
      }

      const body: Record<string, unknown> = {
        action: "send",
        testEventCode: testEventCode.trim(),
      };
      if (tokenInput.trim()) body.capiAccessToken = tokenInput.trim();
      body.pixelId = activePixelId.trim();

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

  const activePixelId = selectedPixelId || pixelIdInput || pixelId;
  const eventsManagerUrl = buildMetaEventsManagerUrl(activePixelId);
  const testEventHowToUrl = buildMetaEventsManagerTestUrl(activePixelId);
  const themeEditorUrl = buildMetaPixelThemeEditorUrl({
    shopDomain,
    apiKey: shopifyApiKey,
  });
  const onlineStoreUrl = buildMetaShopOnlineStoreUrl(shopDomain);

  const canSave =
    !busy &&
    Boolean((mode === "select" ? selectedPixelId : pixelIdInput).trim()) &&
    (!capiEnabled ||
      Boolean(tokenInput.trim()) ||
      hasCapiAccessToken ||
      (mode === "select" && metaOAuthCapiAvailable)) &&
    enabledEvents.length > 0;

  const adAccountOptions =
    adAccounts.length > 0
      ? adAccounts
      : selectedAdAccountId
        ? [{ id: selectedAdAccountId, name: selectedAdAccountId }]
        : [];

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
        {mode === "manual"
          ? t("adsCatalog.metaPixelManualHint")
          : t("adsCatalog.metaPixelSelectHint")}
      </p>

      {needsMetaAdsConnect && !metaAdsConnected ? (
        <div
          style={{
            padding: 10,
            borderRadius: 8,
            background: "#fff5d6",
            border: "1px solid #f0d78a",
            fontSize: 12,
          }}
        >
          <p style={{ margin: "0 0 8px" }}>{t("adsCatalog.metaPixelConnectAdsHint")}</p>
          <button type="button" style={secondaryBtn} disabled={busy} onClick={connectMetaAds}>
            {t("adsCatalog.metaPixelConnectAds")}
          </button>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input
            type="radio"
            name="meta-pixel-mode"
            checked={mode === "select"}
            onChange={switchToSelect}
            disabled={busy}
          />
          {t("adsCatalog.metaPixelModeSelect")}
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input
            type="radio"
            name="meta-pixel-mode"
            checked={mode === "manual"}
            onChange={switchToManual}
            disabled={busy}
          />
          {t("adsCatalog.metaPixelModeManual")}
        </label>
      </div>

      {mode === "select" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {adAccountOptions.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={fieldLabelStyle}>
                {t("adsCatalog.metaPixelAdAccountLabel")}
              </label>
              <select
                style={inputStyle}
                value={selectedAdAccountId}
                disabled={busy || pixelsLoading}
                onChange={(e) => {
                  setSelectedAdAccountId(e.target.value);
                  setSelectedPixelId("");
                }}
              >
                <option value="">
                  {pixelsLoading
                    ? t("adsCatalog.metaPixelListLoading")
                    : t("adsCatalog.metaPixelAdAccountPlaceholder")}
                </option>
                {adAccountOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name && a.name !== a.id ? `${a.name} (${a.id})` : a.id}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={fieldLabelStyle}>{t("adsCatalog.metaPixelSelectLabel")}</label>
            <select
              style={inputStyle}
              value={selectedPixelId}
              disabled={busy || pixelsLoading}
              onChange={(e) => onSelectPixel(e.target.value)}
            >
              <option value="">
                {pixelsLoading
                  ? t("adsCatalog.metaPixelListLoading")
                  : t("adsCatalog.metaPixelSelectPlaceholder")}
              </option>
              {pixels.map((p) => (
                <option key={p.pixelId} value={p.pixelId}>
                  {p.pixelId}
                  {p.pixelName && p.pixelName !== p.pixelId ? ` — ${p.pixelName}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
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
      )}

      {mode === "select" ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: "10px 12px",
            borderRadius: 8,
            border: `1px solid ${pageColorTokens.borderSubtle}`,
            background: pageColorTokens.surfaceSubtle,
          }}
        >
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
          <p style={{ ...pageHintTextStyle, margin: 0 }}>
            {metaOAuthCapiAvailable
              ? t("adsCatalog.metaPixelSelectCapiHint")
              : t("adsCatalog.metaPixelSelectCapiConnectHint")}
          </p>
        </div>
      ) : (
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
                hasStoredCapiAccessToken
                  ? t("adsCatalog.metaPixelAccessTokenConfigured")
                  : t("adsCatalog.metaPixelAccessTokenPlaceholder")
              }
              onChange={(e) => setTokenInput(e.target.value)}
            />
          </div>
        </div>
      )}

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
