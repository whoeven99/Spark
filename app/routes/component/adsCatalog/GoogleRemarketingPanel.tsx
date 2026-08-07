import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { generateGooglePurchaseCustomPixel } from "../../../lib/googleCustomPixel";
import {
  buildGoogleRemarketingThemeEditorUrl,
  buildShopifyCustomerEventsUrl,
  GOOGLE_REMARKETING_CORE_EVENTS,
  GOOGLE_REMARKETING_DEFAULT_EVENTS,
  GOOGLE_REMARKETING_DEFAULT_FIELD_GROUPS,
  GOOGLE_REMARKETING_FIELD_GROUPS,
} from "../../../lib/googleRemarketing";
import { pageColorTokens, pageHintTextStyle } from "../../page/pageUiStyles";
import type { CredentialsView } from "./types";

type Candidate = {
  tagId: string;
  customerId: string;
  customerName?: string;
  source: string;
  crossAccount: boolean;
};

type Props = {
  googleAds: CredentialsView["googleAds"];
  locationSearch: string;
  shopDomain: string;
  shopifyApiKey: string;
  onChanged: () => void;
};

const panelStyle = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  padding: 20,
  background: pageColorTokens.surface,
  display: "flex",
  flexDirection: "column" as const,
  gap: 14,
};

const buttonStyle = {
  padding: "9px 14px",
  borderRadius: 8,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: "#fff",
  color: pageColorTokens.textPrimary,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const primaryButtonStyle = {
  ...buttonStyle,
  background: pageColorTokens.brandGreen,
  borderColor: pageColorTokens.brandGreen,
  color: "#fff",
};

export function GoogleRemarketingPanel({
  googleAds,
  locationSearch,
  shopDomain,
  shopifyApiKey,
  onChanged,
}: Props) {
  const { t } = useTranslation();
  const initial = googleAds.remarketing;
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [tagId, setTagId] = useState(initial.tagId);
  const [manual, setManual] = useState(initial.source === "manual");
  const [events, setEvents] = useState<string[]>(
    initial.enabledEvents.length
      ? initial.enabledEvents
      : [...GOOGLE_REMARKETING_DEFAULT_EVENTS],
  );
  const [fields, setFields] = useState<string[]>(
    initial.enabledFieldGroups.length
      ? initial.enabledFieldGroups
      : [...GOOGLE_REMARKETING_DEFAULT_FIELD_GROUPS],
  );
  const [customPixelScript, setCustomPixelScript] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [guideActive, setGuideActive] = useState(false);
  const [copiedHint, setCopiedHint] = useState("");
  const pixelSectionRef = useRef<HTMLDivElement>(null);

  const endpoint = `/api/ads-catalog/google-remarketing${locationSearch}`;
  const themeEditorUrl = useMemo(
    () => buildGoogleRemarketingThemeEditorUrl({ shopDomain, apiKey: shopifyApiKey }),
    [shopDomain, shopifyApiKey],
  );
  const customerEventsUrl = useMemo(
    () => buildShopifyCustomerEventsUrl(shopDomain),
    [shopDomain],
  );

  async function load() {
    if (!googleAds.connected) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint);
      const data = (await response.json()) as {
        candidates?: Candidate[];
        customPixelScript?: string | null;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || t("adsCatalog.googleRemarketing.loadFailed"));
      setCandidates(data.candidates ?? []);
      setCustomPixelScript(data.customPixelScript ?? "");
      if (!tagId && data.candidates?.[0]?.tagId) setTagId(data.candidates[0].tagId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleAds.connected]);

  function resolveTagId(): string | null {
    const current = tagId.trim().toUpperCase();
    if (/^AW-\d+$/.test(current)) return current;
    if (!manual && candidates.length === 1) {
      const auto = candidates[0]!.tagId;
      setTagId(auto);
      return auto;
    }
    return null;
  }

  async function ensureProductLinkSoft() {
    try {
      await fetch(`/api/ads-catalog/google-status${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "ensure_link" }),
      });
    } catch {
      // 关联失败不阻断再营销配置；商户仍可稍后在 Ads 面板重试。
    }
  }

  async function persistConfig(params: {
    resolvedTag: string;
    enabledEvents: string[];
    enabledFieldGroups: string[];
    customPixelConfirmed?: boolean;
    source?: "auto" | "manual";
  }): Promise<{ partial: boolean }> {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tagId: params.resolvedTag,
        source: params.source ?? (manual ? "manual" : "auto"),
        enabledEvents: params.enabledEvents,
        enabledFieldGroups: params.enabledFieldGroups,
        customPixelConfirmed: params.customPixelConfirmed === true,
      }),
    });
    const data = (await response.json()) as {
      ok?: boolean;
      partial?: boolean;
      error?: string;
    };
    if (!response.ok || !data.ok) {
      throw new Error(data.error || t("adsCatalog.googleRemarketing.saveFailed"));
    }
    return { partial: Boolean(data.partial) };
  }

  async function copyPixelScript(script: string) {
    try {
      await navigator.clipboard.writeText(script);
      setCopiedHint(t("adsCatalog.googleRemarketing.pixelCopied"));
    } catch {
      setCopiedHint(t("adsCatalog.googleRemarketing.pixelCopyFailed"));
    }
  }

  async function save(customPixelConfirmed = false) {
    const resolvedTag = resolveTagId();
    if (!resolvedTag) {
      setError(
        candidates.length > 1
          ? t("adsCatalog.googleRemarketing.selectCandidateFirst")
          : t("adsCatalog.googleRemarketing.invalidTag"),
      );
      return;
    }
    if (!window.confirm(t("adsCatalog.googleRemarketing.confirmTag", { tagId: resolvedTag }))) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await persistConfig({
        resolvedTag,
        enabledEvents: events,
        enabledFieldGroups: fields,
        customPixelConfirmed,
      });
      if (result.partial) setError(t("adsCatalog.googleRemarketing.partialSuccess"));
      onChanged();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function oneClickEnable() {
    const resolvedTag = resolveTagId();
    if (!resolvedTag) {
      setError(
        candidates.length > 1
          ? t("adsCatalog.googleRemarketing.selectCandidateFirst")
          : t("adsCatalog.googleRemarketing.invalidTag"),
      );
      return;
    }
    if (
      !window.confirm(
        t("adsCatalog.googleRemarketing.confirmOneClick", { tagId: resolvedTag }),
      )
    ) {
      return;
    }

    const defaultEvents = [...GOOGLE_REMARKETING_DEFAULT_EVENTS];
    const defaultFields = [...GOOGLE_REMARKETING_DEFAULT_FIELD_GROUPS];
    setEvents(defaultEvents);
    setFields(defaultFields);
    setBusy(true);
    setError("");
    setCopiedHint("");
    setGuideActive(true);

    try {
      await ensureProductLinkSoft();
      const result = await persistConfig({
        resolvedTag,
        enabledEvents: defaultEvents,
        enabledFieldGroups: defaultFields,
        source: manual ? "manual" : "auto",
      });
      if (result.partial) setError(t("adsCatalog.googleRemarketing.partialSuccess"));

      const script = generateGooglePurchaseCustomPixel({
        tagId: resolvedTag,
        enabledFieldGroups: defaultFields,
      });
      setCustomPixelScript(script);
      await copyPixelScript(script);

      window.open(themeEditorUrl, "_blank", "noopener,noreferrer");
      onChanged();
      await load();
      requestAnimationFrame(() => {
        pixelSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setGuideActive(false);
    } finally {
      setBusy(false);
    }
  }

  async function resetCustomPixelConfirmation() {
    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "reset_custom_pixel" }),
      });
      if (!response.ok) throw new Error(t("adsCatalog.googleRemarketing.saveFailed"));
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  function toggle(value: string, selected: string[], update: (next: string[]) => void) {
    update(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );
  }

  if (!googleAds.connected) return null;

  return (
    <div style={panelStyle}>
      <div>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
          {t("adsCatalog.googleRemarketing.title")}
        </h3>
        <p style={pageHintTextStyle}>{t("adsCatalog.googleRemarketing.description")}</p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button
          type="button"
          style={primaryButtonStyle}
          disabled={busy}
          onClick={() => void oneClickEnable()}
        >
          {t("adsCatalog.googleRemarketing.oneClickEnable")}
        </button>
        <a href={themeEditorUrl} target="_blank" rel="noreferrer" style={buttonStyle}>
          {t("adsCatalog.googleRemarketing.openThemeEditor")}
        </a>
      </div>
      <div style={pageHintTextStyle}>{t("adsCatalog.googleRemarketing.oneClickHint")}</div>

      {guideActive ? (
        <div
          style={{
            border: `1px solid ${pageColorTokens.brandGreen}`,
            background: "#f0faf5",
            borderRadius: 8,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontSize: 13,
          }}
        >
          <strong>{t("adsCatalog.googleRemarketing.guideTitle")}</strong>
          <div>1. {t("adsCatalog.googleRemarketing.guideStepConfig")}</div>
          <div>2. {t("adsCatalog.googleRemarketing.guideStepTheme")}</div>
          <div>3. {t("adsCatalog.googleRemarketing.guideStepPixel")}</div>
          <div>4. {t("adsCatalog.googleRemarketing.guideStepConfirm")}</div>
          {copiedHint ? <div style={pageHintTextStyle}>{copiedHint}</div> : null}
        </div>
      ) : null}

      <section>
        <strong style={{ fontSize: 13 }}>{t("adsCatalog.googleRemarketing.awTitle")}</strong>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button type="button" style={buttonStyle} onClick={() => setManual(false)}>
            {t("adsCatalog.googleRemarketing.autoMode")}
          </button>
          <button type="button" style={buttonStyle} onClick={() => setManual(true)}>
            {t("adsCatalog.googleRemarketing.manualMode")}
          </button>
          <button type="button" style={buttonStyle} disabled={busy} onClick={() => void load()}>
            {t("adsCatalog.googleRemarketing.refresh")}
          </button>
        </div>
        {manual ? (
          <input
            value={tagId}
            onChange={(event) => setTagId(event.target.value)}
            placeholder="AW-123456789"
            style={{ width: "100%", marginTop: 10, padding: 10, boxSizing: "border-box" }}
          />
        ) : (
          <select
            value={tagId}
            onChange={(event) => setTagId(event.target.value)}
            style={{ width: "100%", marginTop: 10, padding: 10 }}
          >
            <option value="">{t("adsCatalog.googleRemarketing.selectCandidate")}</option>
            {candidates.map((candidate) => (
              <option key={candidate.tagId} value={candidate.tagId}>
                {candidate.tagId} — {candidate.customerName || candidate.customerId}
                {candidate.crossAccount
                  ? ` (${t("adsCatalog.googleRemarketing.crossAccount")})`
                  : ""}
              </option>
            ))}
          </select>
        )}
      </section>

      <OptionGroup
        title={t("adsCatalog.googleRemarketing.eventsTitle")}
        values={GOOGLE_REMARKETING_CORE_EVENTS}
        selected={events}
        label={(value) => t(`adsCatalog.googleRemarketing.events.${value}`)}
        onToggle={(value) => toggle(value, events, setEvents)}
      />
      <OptionGroup
        title={t("adsCatalog.googleRemarketing.fieldsTitle")}
        values={GOOGLE_REMARKETING_FIELD_GROUPS}
        selected={fields}
        label={(value) => t(`adsCatalog.googleRemarketing.fields.${value}`)}
        onToggle={(value) => toggle(value, fields, setFields)}
      />
      <div style={pageHintTextStyle}>{t("adsCatalog.googleRemarketing.requiredFields")}</div>
      <div style={pageHintTextStyle}>{t("adsCatalog.googleRemarketing.defaultsHint")}</div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button type="button" style={buttonStyle} disabled={busy} onClick={() => void save()}>
          {t("adsCatalog.googleRemarketing.save")}
        </button>
      </div>
      <div style={pageHintTextStyle}>{t("adsCatalog.googleRemarketing.themeManualStatus")}</div>

      <div
        ref={pixelSectionRef}
        style={{
          border: "1px solid #f1c96b",
          background: guideActive ? "#fff3c4" : "#fff7e0",
          borderRadius: 8,
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <strong>{t("adsCatalog.googleRemarketing.experimentalTitle")}</strong>
        <p style={{ margin: 0, fontSize: 13 }}>
          {t("adsCatalog.googleRemarketing.experimentalWarning")}
        </p>
        {guideActive ? (
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
            {t("adsCatalog.googleRemarketing.guidePixelNext")}
          </p>
        ) : null}
        {customPixelScript ? (
          <>
            <textarea
              readOnly
              value={customPixelScript}
              rows={9}
              style={{ width: "100%", fontFamily: "monospace", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button
                type="button"
                style={guideActive ? primaryButtonStyle : buttonStyle}
                onClick={() => void copyPixelScript(customPixelScript)}
              >
                {t("adsCatalog.googleRemarketing.copyPixel")}
              </button>
              <a
                href={customerEventsUrl}
                target="_blank"
                rel="noreferrer"
                style={buttonStyle}
              >
                {t("adsCatalog.googleRemarketing.openCustomerEvents")}
              </a>
              <button
                type="button"
                style={buttonStyle}
                disabled={busy}
                onClick={() => void save(true)}
              >
                {t("adsCatalog.googleRemarketing.confirmPixelInstalled")}
              </button>
              {initial.customPixelConfirmedAt ? (
                <button
                  type="button"
                  style={buttonStyle}
                  disabled={busy}
                  onClick={() => void resetCustomPixelConfirmation()}
                >
                  {t("adsCatalog.googleRemarketing.resetPixelConfirmation")}
                </button>
              ) : null}
            </div>
            <div style={pageHintTextStyle}>
              {initial.customPixelConfirmedAt
                ? t("adsCatalog.googleRemarketing.pixelConfirmed", {
                    time: new Date(initial.customPixelConfirmedAt).toLocaleString(),
                  })
                : t("adsCatalog.googleRemarketing.pixelUnconfirmed")}
            </div>
            {copiedHint && !guideActive ? (
              <div style={pageHintTextStyle}>{copiedHint}</div>
            ) : null}
          </>
        ) : (
          <div style={pageHintTextStyle}>
            {t("adsCatalog.googleRemarketing.pixelNeedsConfig")}
          </div>
        )}
      </div>
      {error ? <div style={{ color: pageColorTokens.critical }}>{error}</div> : null}
    </div>
  );
}

function OptionGroup<T extends string>(props: {
  title: string;
  values: readonly T[];
  selected: string[];
  label: (value: T) => string;
  onToggle: (value: T) => void;
}) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{props.title}</legend>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {props.values.map((value) => (
          <label key={value} style={{ fontSize: 13 }}>
            <input
              type="checkbox"
              checked={props.selected.includes(value)}
              onChange={() => props.onToggle(value)}
            />{" "}
            {props.label(value)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
