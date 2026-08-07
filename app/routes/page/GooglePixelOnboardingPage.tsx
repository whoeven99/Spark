import { useCallback, useEffect, useMemo, useState } from "react";
import { useLoaderData, useNavigate, useRevalidator } from "react-router";
import { useTranslation } from "react-i18next";
import { useEmbeddedLocationSearch } from "../../hooks/useEmbeddedLocationSearch";
import { useOAuthPopup } from "../../hooks/useOAuthPopup";
import {
  PageHeaderNav,
  pageColorTokens,
  pageContentStyle,
  pageFieldLabelStyle,
  pageHintTextStyle,
} from "./pageUiStyles";
import {
  buildGoogleRemarketingThemeEditorUrl,
  buildShopifyCustomerEventsUrl,
  GOOGLE_REMARKETING_DEFAULT_FIELD_GROUPS,
  normalizeGoogleConversionId,
} from "../../lib/googleRemarketing";
import { generateGooglePurchaseCustomPixel } from "../../lib/googleCustomPixel";
import type { GooglePixelLoaderData } from "../app.ads.google-pixel._index";

const STOREFRONT_EVENTS = ["page_view", "add_to_cart", "begin_checkout"] as const;
const WIZARD_EVENTS = ["purchase", "add_to_cart", "page_view", "begin_checkout"] as const;

const cardStyle = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  padding: 24,
  background: pageColorTokens.surface,
  boxShadow: pageColorTokens.shadowCard,
  display: "flex",
  flexDirection: "column" as const,
  gap: 16,
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.borderInput}`,
  fontSize: 13,
  boxSizing: "border-box" as const,
};

const primaryBtn = {
  padding: "10px 20px",
  borderRadius: 8,
  background: pageColorTokens.brandGreen,
  color: "#fff",
  border: "none",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryBtn = {
  padding: "10px 18px",
  borderRadius: 8,
  background: "#fff",
  color: pageColorTokens.textPrimary,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

type EmbedStatus = {
  enabled: boolean;
  unavailable: boolean;
  checking: boolean;
  checked: boolean;
};

export function GooglePixelOnboardingPage() {
  const { t } = useTranslation();
  const loaderData = useLoaderData<GooglePixelLoaderData>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const locationSearch = useEmbeddedLocationSearch();
  const googleOAuth = useOAuthPopup("google_oauth");

  const config = loaderData.config;
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<"connect" | "manual">(
    loaderData.connected ? "connect" : "manual",
  );
  const [pixelName, setPixelName] = useState(config?.pixelName ?? "");
  const [conversionId, setConversionId] = useState(
    (config?.tagId ?? "").replace(/^AW-/i, ""),
  );
  const [conversionLabel, setConversionLabel] = useState(config?.conversionLabel ?? "");
  const [events, setEvents] = useState<string[]>(
    config?.enabledEvents?.length
      ? Array.from(new Set([...config.enabledEvents, "purchase"]))
      : [...WIZARD_EVENTS],
  );
  const [enhanced, setEnhanced] = useState(config?.enhancedConversions ?? false);
  const [embed, setEmbed] = useState<EmbedStatus>({
    enabled: false,
    unavailable: false,
    checking: false,
    checked: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedScript, setSavedScript] = useState("");
  const [copiedHint, setCopiedHint] = useState("");

  const themeEditorUrl = useMemo(
    () =>
      buildGoogleRemarketingThemeEditorUrl({
        shopDomain: loaderData.shopDomain,
        apiKey: loaderData.shopifyApiKey,
      }),
    [loaderData.shopDomain, loaderData.shopifyApiKey],
  );
  const customerEventsUrl = useMemo(
    () => buildShopifyCustomerEventsUrl(loaderData.shopDomain),
    [loaderData.shopDomain],
  );

  const normalizedTag = normalizeGoogleConversionId(conversionId);

  const connect = useCallback(() => {
    setError("");
    void (async () => {
      try {
        await googleOAuth.startOAuth(
          `/api/ads-catalog/google-auth-url${locationSearch}`,
          () => revalidator.revalidate(),
        );
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : t("googlePixelOnboarding.connectFailed"));
      }
    })();
  }, [googleOAuth, locationSearch, revalidator, t]);

  // 连接成功后自动带出 Ads 账户里的 AW 候选，回填 Conversion ID。
  useEffect(() => {
    if (mode !== "connect" || !loaderData.connected || conversionId) return;
    void (async () => {
      try {
        const resp = await fetch(`/api/ads-catalog/google-remarketing${locationSearch}`);
        const data = (await resp.json()) as {
          candidates?: Array<{ tagId: string }>;
        };
        const first = data.candidates?.[0]?.tagId;
        if (first) setConversionId(first.replace(/^AW-/i, ""));
      } catch {
        // 忽略候选拉取失败，用户可手动填写。
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaderData.connected, mode]);

  const refreshEmbed = useCallback(async () => {
    setEmbed((prev) => ({ ...prev, checking: true }));
    try {
      const resp = await fetch(`/api/ads-catalog/google-embed-status${locationSearch}`);
      const data = (await resp.json()) as { enabled?: boolean; unavailable?: boolean };
      setEmbed({
        enabled: Boolean(data.enabled),
        unavailable: Boolean(data.unavailable),
        checking: false,
        checked: true,
      });
    } catch {
      setEmbed({ enabled: false, unavailable: true, checking: false, checked: true });
    }
  }, [locationSearch]);

  useEffect(() => {
    if (step === 2 && !embed.checked && !embed.checking) void refreshEmbed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function toggleEvent(value: string) {
    setEvents((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
  }

  function goStep1Next() {
    if (!normalizedTag) {
      setError(t("googlePixelOnboarding.invalidConversionId"));
      return;
    }
    setError("");
    setStep(2);
  }

  async function copyScript(script: string) {
    try {
      await navigator.clipboard.writeText(script);
      setCopiedHint(t("adsCatalog.googleRemarketing.pixelCopied"));
    } catch {
      setCopiedHint(t("adsCatalog.googleRemarketing.pixelCopyFailed"));
    }
  }

  async function finish() {
    if (!normalizedTag) {
      setStep(1);
      setError(t("googlePixelOnboarding.invalidConversionId"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const storefrontEvents = events.filter((e) =>
        STOREFRONT_EVENTS.includes(e as (typeof STOREFRONT_EVENTS)[number]),
      );
      const resp = await fetch(`/api/ads-catalog/google-remarketing${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tagId: normalizedTag,
          source: mode === "manual" ? "manual" : "auto",
          enabledEvents: storefrontEvents,
          enabledFieldGroups: [...GOOGLE_REMARKETING_DEFAULT_FIELD_GROUPS],
          pixelName: pixelName.trim(),
          conversionLabel: conversionLabel.trim(),
          enhancedConversions: enhanced,
        }),
      });
      const data = (await resp.json()) as { ok?: boolean; partial?: boolean; error?: string };
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || t("googlePixelOnboarding.saveFailed"));
      }
      // 勾选 purchase 时先生成并复制 Custom Pixel，再进入 Pixel 数据页。
      if (events.includes("purchase")) {
        const script = generateGooglePurchaseCustomPixel({
          tagId: normalizedTag,
          enabledFieldGroups: [...GOOGLE_REMARKETING_DEFAULT_FIELD_GROUPS],
          conversionLabel: conversionLabel.trim(),
          enhancedConversions: enhanced,
        });
        setSavedScript(script);
        await copyScript(script);
      }
      navigate(`/app/ads/google-pixel/data${locationSearch}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("googlePixelOnboarding.saveFailed"));
      setBusy(false);
    }
  }

  return (
    <div style={pageContentStyle}>
      <PageHeaderNav
        title={t("googlePixelOnboarding.pageTitle")}
        subtitle={t("googlePixelOnboarding.pageSubtitle")}
        backLabel={t("googlePixelOnboarding.back")}
        fallbackPath="/app/ads-catalog"
        preserveSearch
      />

      <StepIndicator step={step} />

      {step === 1 && (
        <StepAddPixel
          mode={mode}
          setMode={setMode}
          connected={loaderData.connected}
          connecting={googleOAuth.redirecting}
          onConnect={connect}
          pixelName={pixelName}
          setPixelName={setPixelName}
          conversionId={conversionId}
          setConversionId={setConversionId}
          conversionLabel={conversionLabel}
          setConversionLabel={setConversionLabel}
        />
      )}

      {step === 2 && (
        <StepAppEmbed
          embed={embed}
          themeEditorUrl={themeEditorUrl}
          onRefresh={() => void refreshEmbed()}
        />
      )}

      {step === 3 && (
        <StepCreatePixel
          events={events}
          onToggleEvent={toggleEvent}
          enhanced={enhanced}
          setEnhanced={setEnhanced}
          savedScript={savedScript}
          customerEventsUrl={customerEventsUrl}
          copiedHint={copiedHint}
          onCopy={() => void copyScript(savedScript)}
          onDoneToCatalog={() => navigate(`/app/ads/google-pixel/data${locationSearch}`)}
        />
      )}

      {error ? <div style={{ color: pageColorTokens.critical, fontSize: 13 }}>{error}</div> : null}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <button
          type="button"
          style={secondaryBtn}
          disabled={step === 1 || busy}
          onClick={() => setStep((s) => Math.max(1, s - 1))}
        >
          {t("googlePixelOnboarding.navBack")}
        </button>
        {step < 3 ? (
          <div style={{ display: "flex", gap: 12 }}>
            {step === 2 ? (
              <button type="button" style={secondaryBtn} onClick={() => setStep(3)}>
                {t("googlePixelOnboarding.navSkip")}
              </button>
            ) : null}
            <button
              type="button"
              style={primaryBtn}
              disabled={busy}
              onClick={() => (step === 1 ? goStep1Next() : setStep(3))}
            >
              {t("googlePixelOnboarding.navNext")}
            </button>
          </div>
        ) : (
          <button type="button" style={primaryBtn} disabled={busy} onClick={() => void finish()}>
            {busy ? t("googlePixelOnboarding.saving") : t("googlePixelOnboarding.navDone")}
          </button>
        )}
      </div>
    </div>
  );
}

function StepIndicator({ step }: { step: number }) {
  const { t } = useTranslation();
  const titles = [
    t("googlePixelOnboarding.step1Title"),
    t("googlePixelOnboarding.step2Title"),
    t("googlePixelOnboarding.step3Title"),
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {[1, 2, 3].map((index) => (
          <div
            key={index}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              background: index <= step ? pageColorTokens.brandGreen : pageColorTokens.border,
            }}
          />
        ))}
      </div>
      <strong style={{ fontSize: 14 }}>
        {t("googlePixelOnboarding.stepLabel", {
          current: step,
          title: titles[step - 1],
        })}
      </strong>
    </div>
  );
}

function ModeTabs({
  mode,
  setMode,
}: {
  mode: "connect" | "manual";
  setMode: (mode: "connect" | "manual") => void;
}) {
  const { t } = useTranslation();
  const tab = (value: "connect" | "manual", label: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      style={{
        flex: 1,
        padding: "10px 12px",
        borderRadius: 8,
        border: "none",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
        background: mode === value ? pageColorTokens.surface : "transparent",
        boxShadow: mode === value ? pageColorTokens.shadowCard : "none",
        color: mode === value ? pageColorTokens.textPrimary : pageColorTokens.textSecondary,
      }}
    >
      {label}
    </button>
  );
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        padding: 4,
        background: pageColorTokens.surfaceMuted,
        borderRadius: 10,
      }}
    >
      {tab("connect", t("googlePixelOnboarding.tabConnect"))}
      {tab("manual", t("googlePixelOnboarding.tabManual"))}
    </div>
  );
}

function StepAddPixel(props: {
  mode: "connect" | "manual";
  setMode: (mode: "connect" | "manual") => void;
  connected: boolean;
  connecting: boolean;
  onConnect: () => void;
  pixelName: string;
  setPixelName: (value: string) => void;
  conversionId: string;
  setConversionId: (value: string) => void;
  conversionLabel: string;
  setConversionLabel: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div style={cardStyle}>
      <p style={pageHintTextStyle}>{t("googlePixelOnboarding.step1Hint")}</p>
      <ModeTabs mode={props.mode} setMode={props.setMode} />

      {props.mode === "connect" ? (
        props.connected ? (
          <div style={{ color: pageColorTokens.brandGreenDeep, fontWeight: 600, fontSize: 13 }}>
            {t("googlePixelOnboarding.connected")}
          </div>
        ) : (
          <button type="button" style={primaryBtn} disabled={props.connecting} onClick={props.onConnect}>
            {t("googlePixelOnboarding.connectBtn")}
          </button>
        )
      ) : null}

      <div>
        <label style={pageFieldLabelStyle}>{t("googlePixelOnboarding.pixelName")}</label>
        <input
          value={props.pixelName}
          onChange={(e) => props.setPixelName(e.target.value)}
          placeholder={t("googlePixelOnboarding.pixelNamePlaceholder")}
          style={inputStyle}
        />
      </div>
      <div>
        <label style={pageFieldLabelStyle}>{t("googlePixelOnboarding.conversionId")}</label>
        <input
          value={props.conversionId}
          onChange={(e) => props.setConversionId(e.target.value)}
          placeholder="18326838591"
          style={inputStyle}
        />
        <p style={pageHintTextStyle}>{t("googlePixelOnboarding.conversionIdHint")}</p>
      </div>
      <div>
        <label style={pageFieldLabelStyle}>{t("googlePixelOnboarding.conversionLabel")}</label>
        <input
          value={props.conversionLabel}
          onChange={(e) => props.setConversionLabel(e.target.value)}
          placeholder="_fOHCM7Ax90cEL-69aJE"
          style={inputStyle}
        />
        <p style={pageHintTextStyle}>{t("googlePixelOnboarding.conversionLabelHint")}</p>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          border: `1px solid ${pageColorTokens.border}`,
          borderRadius: pageColorTokens.radiusControl,
          padding: 14,
        }}
      >
        <div>
          <strong style={{ fontSize: 13 }}>{t("googlePixelOnboarding.visitAdsTitle")}</strong>
          <p style={{ ...pageHintTextStyle, marginTop: 4 }}>{t("googlePixelOnboarding.visitAdsBody")}</p>
        </div>
        <a href="https://ads.google.com/" target="_blank" rel="noreferrer" style={secondaryBtn}>
          {t("googlePixelOnboarding.visitAdsBtn")}
        </a>
      </div>
    </div>
  );
}

function StepAppEmbed(props: {
  embed: EmbedStatus;
  themeEditorUrl: string;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const statusText = props.embed.checking
    ? t("googlePixelOnboarding.statusChecking")
    : !props.embed.checked
      ? ""
      : props.embed.unavailable
        ? t("googlePixelOnboarding.statusUnavailable")
        : props.embed.enabled
          ? t("googlePixelOnboarding.statusEnabled")
          : t("googlePixelOnboarding.statusDisabled");
  const statusColor = props.embed.enabled
    ? pageColorTokens.brandGreenDeep
    : props.embed.unavailable
      ? pageColorTokens.textSecondary
      : pageColorTokens.critical;

  return (
    <div style={cardStyle}>
      <p style={pageHintTextStyle}>{t("googlePixelOnboarding.step2Hint")}</p>
      <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
        <li>{t("googlePixelOnboarding.step2Instr1")}</li>
        <li>{t("googlePixelOnboarding.step2Instr2")}</li>
        <li>{t("googlePixelOnboarding.step2Instr3")}</li>
        <li>{t("googlePixelOnboarding.step2Instr4")}</li>
      </ol>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <a href={props.themeEditorUrl} target="_blank" rel="noreferrer" style={primaryBtn}>
          {t("googlePixelOnboarding.enableAppEmbed")}
        </a>
        <button
          type="button"
          style={secondaryBtn}
          disabled={props.embed.checking}
          onClick={props.onRefresh}
        >
          {t("googlePixelOnboarding.refreshStatus")}
        </button>
        {statusText ? (
          <span style={{ color: statusColor, fontSize: 13, fontWeight: 600 }}>{statusText}</span>
        ) : null}
      </div>
    </div>
  );
}

function StepCreatePixel(props: {
  events: string[];
  onToggleEvent: (value: string) => void;
  enhanced: boolean;
  setEnhanced: (value: boolean) => void;
  savedScript: string;
  customerEventsUrl: string;
  copiedHint: string;
  onCopy: () => void;
  onDoneToCatalog: () => void;
}) {
  const { t } = useTranslation();
  const eventLabel = (value: string) =>
    value === "purchase"
      ? t("googlePixelOnboarding.events.purchase")
      : t(`adsCatalog.googleRemarketing.events.${value}`);

  return (
    <div style={cardStyle}>
      <p style={pageHintTextStyle}>{t("googlePixelOnboarding.step3Hint")}</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {WIZARD_EVENTS.map((value) => (
          <label key={value} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={props.events.includes(value)}
              onChange={() => props.onToggleEvent(value)}
            />
            {eventLabel(value)}
          </label>
        ))}
      </div>

      <div
        style={{
          border: `1px solid ${pageColorTokens.border}`,
          borderRadius: pageColorTokens.radiusControl,
          padding: 14,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div>
          <strong style={{ fontSize: 13 }}>{t("googlePixelOnboarding.enhancedTitle")}</strong>
          <p style={{ ...pageHintTextStyle, marginTop: 4 }}>{t("googlePixelOnboarding.enhancedBody")}</p>
        </div>
        <button
          type="button"
          style={props.enhanced ? primaryBtn : secondaryBtn}
          onClick={() => props.setEnhanced(!props.enhanced)}
        >
          {props.enhanced
            ? t("googlePixelOnboarding.enhancedOn")
            : t("googlePixelOnboarding.enhancedOff")}
        </button>
      </div>

      {props.events.includes("purchase") ? (
        <div
          style={{
            border: "1px solid #f1c96b",
            background: "#fff7e0",
            borderRadius: 8,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <strong>{t("adsCatalog.googleRemarketing.experimentalTitle")}</strong>
          <p style={{ margin: 0, fontSize: 13 }}>
            {t("adsCatalog.googleRemarketing.experimentalWarning")}
          </p>
          {props.savedScript ? (
            <>
              <textarea
                readOnly
                value={props.savedScript}
                rows={8}
                style={{ width: "100%", fontFamily: "monospace", boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" style={primaryBtn} onClick={props.onCopy}>
                  {t("adsCatalog.googleRemarketing.copyPixel")}
                </button>
                <a href={props.customerEventsUrl} target="_blank" rel="noreferrer" style={secondaryBtn}>
                  {t("adsCatalog.googleRemarketing.openCustomerEvents")}
                </a>
                <button type="button" style={secondaryBtn} onClick={props.onDoneToCatalog}>
                  {t("googlePixelOnboarding.finishToCatalog")}
                </button>
              </div>
              {props.copiedHint ? <div style={pageHintTextStyle}>{props.copiedHint}</div> : null}
            </>
          ) : (
            <div style={pageHintTextStyle}>{t("googlePixelOnboarding.purchaseNeedsSave")}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
