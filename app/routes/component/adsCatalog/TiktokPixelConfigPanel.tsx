import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens, pageHintTextStyle } from "../../page/pageUiStyles";
import {
  buildShopOnlineStoreUrl,
  buildTiktokEventsManagerTestUrl,
  buildTiktokEventsManagerUrl,
  buildTiktokPixelThemeEditorUrl,
  TIKTOK_PIXEL_DEFAULT_EVENTS,
  TIKTOK_PIXEL_OPTIONAL_EVENTS,
  type TiktokPixelEventName,
} from "../../../lib/tiktokPixelEvents";

type PixelListItem = {
  pixelCode: string;
  pixelName: string;
};

type AdvertiserItem = {
  advertiserId: string;
  advertiserName: string;
};

type Props = {
  locationSearch: string;
  shopDomain: string;
  shopifyApiKey: string;
  pixelCode: string;
  /** 当前 Catalog 绑定的广告主，作为业务账户默认值。 */
  advertiserId: string;
  hasEventsApiAccessToken: boolean;
  eventsApiEnabled: boolean;
  enabledEvents: string[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  onChanged: () => void;
  onDiagnosisRefresh: () => void;
  onBindError: (msg: string | null) => void;
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
  ViewContent: "tiktokPixelEventViewContent",
  AddToCart: "tiktokPixelEventAddToCart",
  InitiateCheckout: "tiktokPixelEventInitiateCheckout",
  CompletePayment: "tiktokPixelEventPurchase",
  PageView: "tiktokPixelEventPageView",
  Search: "tiktokPixelEventSearch",
  CollectionView: "tiktokPixelEventCollectionView",
  CartView: "tiktokPixelEventCartView",
  AddPaymentInfo: "tiktokPixelEventAddPaymentInfo",
  Lead: "tiktokPixelEventLead",
};

function withAdvertiserQuery(locationSearch: string, advertiserId: string): string {
  const params = new URLSearchParams(
    locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch,
  );
  if (advertiserId) params.set("advertiserId", advertiserId);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function TiktokPixelConfigPanel({
  locationSearch,
  shopDomain,
  shopifyApiKey,
  pixelCode,
  advertiserId: boundAdvertiserId,
  hasEventsApiAccessToken,
  eventsApiEnabled: initialEventsApiEnabled,
  enabledEvents: initialEnabledEvents,
  busy,
  setBusy,
  onChanged,
  onDiagnosisRefresh,
  onBindError,
}: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"select" | "create">(
    pixelCode ? "select" : "create",
  );
  const [advertisers, setAdvertisers] = useState<AdvertiserItem[]>([]);
  const [selectedAdvertiserId, setSelectedAdvertiserId] = useState(boundAdvertiserId);
  const [pixels, setPixels] = useState<PixelListItem[]>([]);
  const [pixelsLoading, setPixelsLoading] = useState(false);
  const [selectedPixelCode, setSelectedPixelCode] = useState(pixelCode);
  const [pixelName, setPixelName] = useState("");
  const [eventsApiEnabled, setEventsApiEnabled] = useState(initialEventsApiEnabled);
  const [tokenInput, setTokenInput] = useState("");
  const [testEventCode, setTestEventCode] = useState("");
  const [enabledEvents, setEnabledEvents] = useState<string[]>(
    initialEnabledEvents.length
      ? initialEnabledEvents
      : [...TIKTOK_PIXEL_DEFAULT_EVENTS],
  );
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  /** 创建成功后预选的 Pixel，避免被列表刷新/父级 props 覆盖前丢失。 */
  const [pendingSelectPixelCode, setPendingSelectPixelCode] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (pendingSelectPixelCode) {
      setSelectedPixelCode(pendingSelectPixelCode);
      setMode("select");
      return;
    }
    setSelectedPixelCode(pixelCode);
    if (pixelCode) setMode("select");
  }, [pixelCode, pendingSelectPixelCode]);

  useEffect(() => {
    if (boundAdvertiserId) setSelectedAdvertiserId(boundAdvertiserId);
  }, [boundAdvertiserId]);

  useEffect(() => {
    setEventsApiEnabled(initialEventsApiEnabled);
  }, [initialEventsApiEnabled]);

  useEffect(() => {
    setEnabledEvents(
      initialEnabledEvents.length
        ? initialEnabledEvents
        : [...TIKTOK_PIXEL_DEFAULT_EVENTS],
    );
  }, [initialEnabledEvents]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setPixelsLoading(true);
      try {
        const qs = withAdvertiserQuery(locationSearch, selectedAdvertiserId);
        const resp = await fetch(`/api/ads-catalog/tiktok-pixels${qs}`, {
          headers: { Accept: "application/json" },
        });
        const data = (await resp.json().catch(() => ({}))) as {
          ok?: boolean;
          pixels?: PixelListItem[];
          advertisers?: AdvertiserItem[];
          advertiserId?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!resp.ok || !data.ok) {
          setLocalError(data.error ?? t("adsCatalog.authError"));
          setPixels([]);
          return;
        }
        setAdvertisers(data.advertisers ?? []);
        if (data.advertiserId && !selectedAdvertiserId) {
          setSelectedAdvertiserId(data.advertiserId);
        }
        const nextPixels = data.pixels ?? [];
        setPixels(nextPixels);
        setLocalError(null);

        if (mode === "select") {
          const preferCode = pendingSelectPixelCode || selectedPixelCode || pixelCode;
          const matched = nextPixels.find((p) => p.pixelCode === preferCode);
          if (matched) {
            setSelectedPixelCode(matched.pixelCode);
            setPixelName(matched.pixelName);
            if (pendingSelectPixelCode === matched.pixelCode) {
              setPendingSelectPixelCode(null);
            }
          } else if (
            selectedPixelCode &&
            !pendingSelectPixelCode &&
            !nextPixels.some((p) => p.pixelCode === selectedPixelCode)
          ) {
            setSelectedPixelCode("");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reload when account or mode changes
  }, [mode, locationSearch, selectedAdvertiserId, t, pendingSelectPixelCode]);

  function toggleEvent(name: TiktokPixelEventName) {
    setEnabledEvents((prev) =>
      prev.includes(name) ? prev.filter((e) => e !== name) : [...prev, name],
    );
  }

  function onSelectPixel(code: string) {
    setSelectedPixelCode(code);
    const hit = pixels.find((p) => p.pixelCode === code);
    if (hit?.pixelName) setPixelName(hit.pixelName);
  }

  function switchToCreate() {
    setMode("create");
    setCreateSuccess(false);
    setSaveSuccess(false);
    setLocalError(null);
    onBindError(null);
  }

  function switchToSelect() {
    setMode("select");
    setCreateSuccess(false);
    setSaveSuccess(false);
    setLocalError(null);
    onBindError(null);
  }

  async function createPixelOnly() {
    setBusy(true);
    setCreateSuccess(false);
    setSaveSuccess(false);
    setTestSuccess(false);
    setLocalError(null);
    onBindError(null);
    try {
      if (!selectedAdvertiserId) {
        setLocalError(t("adsCatalog.tiktokPixelBusinessAccountRequired"));
        return;
      }
      if (!pixelName.trim()) {
        setLocalError(t("adsCatalog.tiktokPixelNameRequired"));
        return;
      }

      const resp = await fetch(`/api/ads-catalog/tiktok-pixel-config${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "create",
          advertiserId: selectedAdvertiserId,
          pixelName: pixelName.trim(),
          bindCatalogEventSource: false,
        }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        pixelCode?: string;
        error?: string;
      };
      if (!resp.ok || !data.ok || !data.pixelCode) {
        const msg = data.error ?? t("adsCatalog.authError");
        setLocalError(msg);
        onBindError(msg);
        return;
      }

      const createdCode = data.pixelCode;
      setPendingSelectPixelCode(createdCode);
      setSelectedPixelCode(createdCode);
      setMode("select");
      setCreateSuccess(true);
      onChanged();
      onDiagnosisRefresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("adsCatalog.authError");
      setLocalError(msg);
      onBindError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function saveSelectConfig() {
    setBusy(true);
    setSaveSuccess(false);
    setCreateSuccess(false);
    setTestSuccess(false);
    setLocalError(null);
    onBindError(null);
    try {
      if (!selectedAdvertiserId) {
        setLocalError(t("adsCatalog.tiktokPixelBusinessAccountRequired"));
        return;
      }
      if (!selectedPixelCode) {
        setLocalError(t("adsCatalog.tiktokPixelSelectRequired"));
        return;
      }
      if (!tokenInput.trim() && !hasEventsApiAccessToken) {
        setLocalError(t("adsCatalog.tiktokPixelTokenRequired"));
        return;
      }

      const body: Record<string, unknown> = {
        mode: "select",
        advertiserId: selectedAdvertiserId,
        pixelCode: selectedPixelCode,
        eventsApiEnabled,
        enabledEvents,
        // 保存只写 Token/事件/metafield；Catalog 事件源绑定交给下方「一键绑定 / 重新绑定」。
        bindCatalogEventSource: false,
      };
      if (pixelName.trim()) body.pixelName = pixelName.trim();
      if (tokenInput.trim()) body.eventsApiAccessToken = tokenInput.trim();

      const resp = await fetch(`/api/ads-catalog/tiktok-pixel-config${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!resp.ok || !data.ok) {
        const msg = data.error ?? t("adsCatalog.authError");
        setLocalError(msg);
        onBindError(msg);
        return;
      }
      setTokenInput("");
      setSaveSuccess(true);
      onChanged();
      onDiagnosisRefresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("adsCatalog.authError");
      setLocalError(msg);
      onBindError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function testServerEvents() {
    setBusy(true);
    setTestSuccess(false);
    setLocalError(null);
    try {
      if (!testEventCode.trim()) {
        setLocalError(t("adsCatalog.tiktokPixelTestEventCodeRequired"));
        return;
      }
      if (!hasEventsApiAccessToken && !tokenInput.trim()) {
        setLocalError(t("adsCatalog.tiktokPixelTokenRequired"));
        return;
      }
      if (!pixelCode && !selectedPixelCode) {
        setLocalError(t("adsCatalog.tiktokPixelSelectRequired"));
        return;
      }

      const body: Record<string, unknown> = {
        testEventCode: testEventCode.trim(),
      };
      if (tokenInput.trim()) {
        body.eventsApiAccessToken = tokenInput.trim();
      }
      const activePixel = selectedPixelCode || pixelCode;
      if (activePixel) body.pixelCode = activePixel;

      const resp = await fetch(`/api/ads-catalog/tiktok-test-events${locationSearch}`, {
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
      setTestSuccess(true);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : t("adsCatalog.authError"));
    } finally {
      setBusy(false);
    }
  }

  const howToUrl = buildTiktokEventsManagerUrl(selectedPixelCode || pixelCode);
  const testEventHowToUrl = buildTiktokEventsManagerTestUrl(
    selectedPixelCode || pixelCode,
  );
  const themeEditorUrl = buildTiktokPixelThemeEditorUrl({
    shopDomain,
    apiKey: shopifyApiKey,
  });
  const onlineStoreUrl = buildShopOnlineStoreUrl(shopDomain);
  const canTestServerEvents =
    !busy &&
    Boolean(testEventCode.trim()) &&
    (Boolean(tokenInput.trim()) || hasEventsApiAccessToken) &&
    Boolean(pixelCode || selectedPixelCode);
  const canCreate =
    !busy && Boolean(selectedAdvertiserId) && Boolean(pixelName.trim());
  const canSaveSelect =
    !busy &&
    Boolean(selectedAdvertiserId) &&
    Boolean(selectedPixelCode) &&
    (Boolean(tokenInput.trim()) || hasEventsApiAccessToken) &&
    enabledEvents.length > 0;

  const advertiserOptions =
    advertisers.length > 0
      ? advertisers
      : selectedAdvertiserId
        ? [{ advertiserId: selectedAdvertiserId, advertiserName: selectedAdvertiserId }]
        : [];

  function openExternal(url: string | null) {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>
        {t("adsCatalog.tiktokPixelSectionTitle")}
      </div>
      {pixelCode ? (
        <div style={{ color: "#0f7a52", fontSize: 13 }}>
          {t("adsCatalog.tiktokPixelCode", { code: pixelCode })}
        </div>
      ) : null}
      <p style={{ ...pageHintTextStyle, margin: 0 }}>
        {mode === "create"
          ? t("adsCatalog.tiktokPixelCreateHint")
          : t("adsCatalog.tiktokPixelConfigHint")}
      </p>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input
            type="radio"
            name="tiktok-pixel-mode"
            checked={mode === "select"}
            onChange={switchToSelect}
            disabled={busy}
          />
          {t("adsCatalog.tiktokPixelModeSelect")}
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input
            type="radio"
            name="tiktok-pixel-mode"
            checked={mode === "create"}
            onChange={switchToCreate}
            disabled={busy}
          />
          {t("adsCatalog.tiktokPixelModeCreate")}
        </label>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={fieldLabelStyle}>{t("adsCatalog.tiktokPixelNameLabel")}</label>
          <input
            style={inputStyle}
            value={pixelName}
            disabled={busy}
            placeholder={t("adsCatalog.tiktokPixelNamePlaceholder")}
            onChange={(e) => setPixelName(e.target.value)}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={fieldLabelStyle}>
            {t("adsCatalog.tiktokPixelBusinessAccountLabel")}
          </label>
          <select
            style={inputStyle}
            value={selectedAdvertiserId}
            disabled={busy || pixelsLoading || advertiserOptions.length === 0}
            onChange={(e) => {
              setSelectedAdvertiserId(e.target.value);
              setSelectedPixelCode("");
              if (mode === "select") setPixelName("");
            }}
          >
            <option value="">
              {pixelsLoading
                ? t("adsCatalog.tiktokPixelListLoading")
                : t("adsCatalog.tiktokPixelBusinessAccountPlaceholder")}
            </option>
            {advertiserOptions.map((a) => (
              <option key={a.advertiserId} value={a.advertiserId}>
                {a.advertiserName && a.advertiserName !== a.advertiserId
                  ? `${a.advertiserName} (${a.advertiserId})`
                  : a.advertiserId}
              </option>
            ))}
          </select>
        </div>

        {mode === "select" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={fieldLabelStyle}>{t("adsCatalog.tiktokPixelSelectLabel")}</label>
            <select
              style={inputStyle}
              value={selectedPixelCode}
              disabled={busy || pixelsLoading || !selectedAdvertiserId}
              onChange={(e) => onSelectPixel(e.target.value)}
            >
              <option value="">
                {pixelsLoading
                  ? t("adsCatalog.tiktokPixelListLoading")
                  : t("adsCatalog.tiktokPixelSelectPlaceholder")}
              </option>
              {pixels.map((p) => (
                <option key={p.pixelCode} value={p.pixelCode}>
                  {p.pixelCode}
                  {p.pixelName && p.pixelName !== p.pixelCode ? ` — ${p.pixelName}` : ""}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {mode === "create" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            style={primaryBtn}
            disabled={!canCreate}
            onClick={() => void createPixelOnly()}
          >
            {busy ? t("adsCatalog.tiktokPixelCreateBusy") : t("adsCatalog.tiktokPixelCreate")}
          </button>
          {createSuccess && (
            <span style={{ color: "#0f7a52", fontSize: 12 }}>
              {t("adsCatalog.tiktokPixelCreateSuccess")}
            </span>
          )}
        </div>
      ) : (
        <>
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
                {t("adsCatalog.tiktokPixelServerSideTitle")}
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
                {t("adsCatalog.tiktokPixelRequiredBadge")}
              </span>
            </div>
            <p style={{ ...pageHintTextStyle, margin: 0 }}>
              {t("adsCatalog.tiktokPixelServerSideHint")}
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
                checked={eventsApiEnabled}
                disabled={busy}
                onChange={(e) => setEventsApiEnabled(e.target.checked)}
              />
              {t("adsCatalog.tiktokPixelCapiEnable")}
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
                <label style={fieldLabelStyle}>
                  {t("adsCatalog.tiktokPixelAccessTokenLabel")}
                </label>
                <a
                  href={howToUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 12, color: "#005bd3" }}
                >
                  {t("adsCatalog.tiktokPixelHowToGetToken")}
                </a>
              </div>
              <input
                style={inputStyle}
                type="password"
                autoComplete="off"
                value={tokenInput}
                disabled={busy}
                placeholder={
                  hasEventsApiAccessToken
                    ? t("adsCatalog.tiktokPixelAccessTokenConfigured")
                    : t("adsCatalog.tiktokPixelAccessTokenPlaceholder")
                }
                onChange={(e) => setTokenInput(e.target.value)}
              />
            </div>
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
                <label style={fieldLabelStyle}>
                  {t("adsCatalog.tiktokPixelTestEventCodeLabel")}
                </label>
                <a
                  href={testEventHowToUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 12, color: "#005bd3" }}
                >
                  {t("adsCatalog.tiktokPixelHowToGetTestEventCode")}
                </a>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  style={{ ...inputStyle, flex: 1, minWidth: 160 }}
                  value={testEventCode}
                  disabled={busy}
                  placeholder={t("adsCatalog.tiktokPixelTestEventCodePlaceholder")}
                  onChange={(e) => {
                    setTestEventCode(e.target.value);
                    setTestSuccess(false);
                  }}
                />
                <button
                  type="button"
                  style={{ ...secondaryBtn, padding: "8px 10px", whiteSpace: "nowrap" }}
                  disabled={busy}
                  onClick={() => openExternal(testEventHowToUrl)}
                >
                  {t("adsCatalog.tiktokPixelGetTestEventCode")}
                </button>
                {testEventCode ? (
                  <button
                    type="button"
                    style={{ ...secondaryBtn, padding: "8px 10px", whiteSpace: "nowrap" }}
                    disabled={busy}
                    onClick={() => {
                      setTestEventCode("");
                      setTestSuccess(false);
                    }}
                  >
                    {t("adsCatalog.tiktokPixelTestEventCodeClear")}
                  </button>
                ) : null}
              </div>
              <p style={{ ...pageHintTextStyle, margin: 0 }}>
                {t("adsCatalog.tiktokPixelTestEventCodeHint")}
              </p>
              <p style={{ margin: 0, fontSize: 12, color: "#b98900", fontWeight: 600 }}>
                {t("adsCatalog.tiktokPixelTestEventCodeWarning")}
              </p>
            </div>
            <button
              type="button"
              style={{ ...secondaryBtn, alignSelf: "flex-start", padding: "4px 8px" }}
              disabled={!canTestServerEvents}
              onClick={() => void testServerEvents()}
            >
              {busy
                ? t("adsCatalog.tiktokPixelTestServerEventsBusy")
                : t("adsCatalog.tiktokPixelTestServerEvents")}
            </button>
            {testSuccess && (
              <span style={{ color: "#0f7a52", fontSize: 12 }}>
                {t("adsCatalog.tiktokPixelTestServerEventsSuccess")}
              </span>
            )}
          </div>

          <div
            style={{
              border: `1px solid ${pageColorTokens.border}`,
              borderRadius: 8,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              background: pageColorTokens.surfaceSubtle,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              {t("adsCatalog.tiktokPixelAppThemeTitle")}
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
                  {t("adsCatalog.tiktokPixelAppThemeStatusLabel")}
                </span>
                <span style={{ ...pageHintTextStyle, margin: 0 }}>
                  {t("adsCatalog.tiktokPixelAppThemeStatusHint")}
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
                {t("adsCatalog.tiktokPixelAppThemeActivate")}
              </button>
            </div>
            <p style={{ ...pageHintTextStyle, margin: 0 }}>
              {t("adsCatalog.tiktokPixelEmbedHint")}
            </p>

            <div style={{ fontSize: 13, fontWeight: 700 }}>
              {t("adsCatalog.tiktokPixelTestYourEventTitle")}
            </div>
            <p style={{ ...pageHintTextStyle, margin: 0 }}>
              {t("adsCatalog.tiktokPixelTestYourEventHint")}
            </p>
            <button
              type="button"
              style={{
                ...secondaryBtn,
                alignSelf: "flex-start",
                opacity: onlineStoreUrl ? 1 : 0.5,
                cursor: onlineStoreUrl ? "pointer" : "not-allowed",
              }}
              disabled={!onlineStoreUrl}
              onClick={() => openExternal(onlineStoreUrl)}
            >
              {t("adsCatalog.tiktokPixelGoToOnlineStore")}
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {t("adsCatalog.tiktokPixelEventsTitle")}
            </div>
            <p style={{ ...pageHintTextStyle, margin: 0 }}>
              {t("adsCatalog.tiktokPixelEventsHint")}
            </p>
            <div
              style={{ fontSize: 12, fontWeight: 600, color: pageColorTokens.textSecondary }}
            >
              {t("adsCatalog.tiktokPixelEventsDefault")}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {TIKTOK_PIXEL_DEFAULT_EVENTS.map((name) => (
                <label
                  key={name}
                  style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
                >
                  <input
                    type="checkbox"
                    checked={enabledEvents.includes(name)}
                    disabled={busy}
                    onChange={() => toggleEvent(name)}
                  />
                  {t(`adsCatalog.${EVENT_LABEL_KEY[name] ?? name}`)}
                </label>
              ))}
            </div>
            <div
              style={{ fontSize: 12, fontWeight: 600, color: pageColorTokens.textSecondary }}
            >
              {t("adsCatalog.tiktokPixelEventsOptional")}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {TIKTOK_PIXEL_OPTIONAL_EVENTS.map((name) => (
                <label
                  key={name}
                  style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
                >
                  <input
                    type="checkbox"
                    checked={enabledEvents.includes(name)}
                    disabled={busy}
                    onChange={() => toggleEvent(name)}
                  />
                  {t(`adsCatalog.${EVENT_LABEL_KEY[name] ?? name}`)}
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              style={primaryBtn}
              disabled={!canSaveSelect}
              onClick={() => void saveSelectConfig()}
            >
              {busy ? t("adsCatalog.tiktokPixelSaveBusy") : t("adsCatalog.tiktokPixelSave")}
            </button>
            {saveSuccess && (
              <span style={{ color: "#0f7a52", fontSize: 12 }}>
                {t("adsCatalog.tiktokPixelSaveSuccess")}
              </span>
            )}
            {createSuccess && (
              <span style={{ color: "#0f7a52", fontSize: 12 }}>
                {t("adsCatalog.tiktokPixelCreateSuccess")}
              </span>
            )}
          </div>
        </>
      )}

      {localError && (
        <span style={{ color: "#d72c0d", fontSize: 12 }}>{localError}</span>
      )}
    </div>
  );
}
