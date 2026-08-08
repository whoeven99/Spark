import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEmbeddedLocationSearch } from "../../../hooks/useEmbeddedLocationSearch";
import { useOAuthPopup } from "../../../hooks/useOAuthPopup";
import {
  GOOGLE_PIXEL_OPTIONAL_EVENTS,
  GOOGLE_PIXEL_RECOMMENDED_EVENTS,
  type GooglePixelSetupEvent,
} from "../../../lib/googlePixelEvents";
import {
  buildGoogleRemarketingThemeEditorUrl,
  buildShopifyCustomerEventsUrl,
} from "../../../lib/googleRemarketing";
import {
  pageColorTokens,
  pageFieldLabelStyle,
  pageHintTextStyle,
} from "../../page/pageUiStyles";

type AdsAccount = {
  id: string;
  formatted?: string;
  name?: string;
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: 24,
};

const modalStyle: React.CSSProperties = {
  width: "min(560px, 100%)",
  maxHeight: "90vh",
  overflow: "auto",
  background: pageColorTokens.surface,
  borderRadius: pageColorTokens.radiusCard,
  boxShadow: pageColorTokens.shadowCard,
  border: `1px solid ${pageColorTokens.border}`,
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 8,
  background: pageColorTokens.brandGreen,
  color: "#fff",
  border: "none",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 8,
  background: "#fff",
  color: pageColorTokens.textPrimary,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

export function GooglePixelSetupModal(props: {
  open: boolean;
  onClose: () => void;
  connected: boolean;
  shopDomain: string;
  shopifyApiKey: string;
  customerId: string;
  customerName: string;
  defaultPixelName: string;
  onConnected?: () => void;
  onSaved: (result: { customPixelScript: string | null }) => void;
}) {
  const { t } = useTranslation();
  const locationSearch = useEmbeddedLocationSearch();
  const googleOAuth = useOAuthPopup("google_oauth");
  const [step, setStep] = useState(1);
  const [accounts, setAccounts] = useState<AdsAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState(props.customerId);
  const [pixelName, setPixelName] = useState(props.defaultPixelName);
  const [selectedEvents, setSelectedEvents] = useState<GooglePixelSetupEvent[]>([
    ...GOOGLE_PIXEL_RECOMMENDED_EVENTS,
  ]);
  const [enhanced, setEnhanced] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const themeEditorUrl = useMemo(
    () =>
      buildGoogleRemarketingThemeEditorUrl({
        shopDomain: props.shopDomain,
        apiKey: props.shopifyApiKey,
      }),
    [props.shopDomain, props.shopifyApiKey],
  );
  const customerEventsUrl = useMemo(
    () => buildShopifyCustomerEventsUrl(props.shopDomain),
    [props.shopDomain],
  );

  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    setError("");
    try {
      const resp = await fetch(`/api/ads-catalog/google-ads-accounts${locationSearch}`);
      const data = (await resp.json()) as {
        ok?: boolean;
        accounts?: AdsAccount[];
        error?: string;
      };
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || t("googlePixel.setup.accountsFailed"));
      }
      setAccounts(data.accounts ?? []);
      if (data.accounts?.length && !selectedAccountId) {
        setSelectedAccountId(data.accounts[0].id);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("googlePixel.setup.accountsFailed"));
    } finally {
      setLoadingAccounts(false);
    }
  }, [locationSearch, selectedAccountId, t]);

  useEffect(() => {
    if (!props.open) return;
    setStep(1);
    setPixelName(props.defaultPixelName);
    setSelectedAccountId(props.customerId);
    setSelectedEvents([...GOOGLE_PIXEL_RECOMMENDED_EVENTS]);
    setEnhanced(false);
    setError("");
    if (props.connected) void loadAccounts();
  }, [props.open, props.defaultPixelName, props.customerId, props.connected, loadAccounts]);

  const connectGoogle = useCallback(async () => {
    setError("");
    try {
      await googleOAuth.startOAuth(
        `/api/ads-catalog/google-auth-url${locationSearch}`,
        () => {
          props.onConnected?.();
          void loadAccounts();
        },
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("googlePixelOnboarding.connectFailed"));
    }
  }, [googleOAuth, loadAccounts, locationSearch, t]);

  async function selectAccount(customerId: string) {
    setSelectedAccountId(customerId);
    setError("");
    try {
      const resp = await fetch(`/api/ads-catalog/google-ads-accounts${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId }),
      });
      const data = (await resp.json()) as { ok?: boolean; error?: string };
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || t("googlePixel.setup.accountsFailed"));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("googlePixel.setup.accountsFailed"));
    }
  }

  function toggleEvent(event: GooglePixelSetupEvent) {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((item) => item !== event) : [...prev, event],
    );
  }

  function toggleGroup(events: readonly GooglePixelSetupEvent[], selectAll: boolean) {
    setSelectedEvents((prev) => {
      const next = new Set(prev);
      for (const event of events) {
        if (selectAll) next.add(event);
        else next.delete(event);
      }
      return [...next];
    });
  }

  async function save() {
    if (selectedEvents.length === 0) {
      setError(t("googlePixel.setup.selectAtLeastOne"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const resp = await fetch(`/api/ads-catalog/google-remarketing${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "setup",
          pixelName: pixelName.trim(),
          selectedEvents,
          enhancedConversions: enhanced,
        }),
      });
      const data = (await resp.json()) as {
        ok?: boolean;
        error?: string;
        customPixelScript?: string | null;
      };
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || t("googlePixelOnboarding.saveFailed"));
      }
      props.onSaved({ customPixelScript: data.customPixelScript ?? null });
      props.onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("googlePixelOnboarding.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (!props.open) return null;

  const accountLabel =
    accounts.find((item) => item.id === selectedAccountId)?.name ||
    props.customerName ||
    t("googlePixel.setup.accountFallback");

  return (
    <div style={overlayStyle} onClick={props.onClose}>
      <div style={modalStyle} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <strong style={{ fontSize: 16 }}>
            {step === 1
              ? t("googlePixel.setup.step1Title")
              : t("googlePixel.setup.step2Title")}
          </strong>
          <button type="button" style={secondaryBtn} onClick={props.onClose}>
            ×
          </button>
        </div>

        {step === 1 ? (
          <>
            <p style={pageHintTextStyle}>{t("googlePixel.setup.step1Hint")}</p>
            {!props.connected ? (
              <button
                type="button"
                style={primaryBtn}
                disabled={googleOAuth.redirecting}
                onClick={() => void connectGoogle()}
              >
                {t("googlePixelOnboarding.connectBtn")}
              </button>
            ) : (
              <>
                <div>
                  <label style={pageFieldLabelStyle}>{t("googlePixel.setup.accountLabel")}</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <select
                      value={selectedAccountId}
                      onChange={(event) => void selectAccount(event.target.value)}
                      style={{ flex: 1, padding: "10px 12px", borderRadius: 8 }}
                      disabled={loadingAccounts || busy}
                    >
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name || account.formatted || account.id} ({account.id})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      style={secondaryBtn}
                      disabled={loadingAccounts}
                      onClick={() => void loadAccounts()}
                    >
                      {t("googlePixel.setup.refreshAccounts")}
                    </button>
                  </div>
                </div>
                <div>
                  <label style={pageFieldLabelStyle}>{t("googlePixelOnboarding.pixelName")}</label>
                  <input
                    value={pixelName}
                    onChange={(event) => setPixelName(event.target.value)}
                    placeholder={t("googlePixelOnboarding.pixelNamePlaceholder")}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 8, boxSizing: "border-box" }}
                  />
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <span
              style={{
                alignSelf: "flex-start",
                padding: "4px 10px",
                borderRadius: 999,
                background: "#e8f1ff",
                color: "#1d4ed8",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {accountLabel} ({selectedAccountId || props.customerId})
            </span>
            <EventGroup
              title={t("googlePixel.setup.recommended")}
              events={[...GOOGLE_PIXEL_RECOMMENDED_EVENTS]}
              selected={selectedEvents}
              onToggle={toggleEvent}
              onSelectAll={(selectAll) =>
                toggleGroup(GOOGLE_PIXEL_RECOMMENDED_EVENTS, selectAll)
              }
              labelOf={(event) => t(`googlePixel.setup.events.${event}`)}
            />
            <EventGroup
              title={t("googlePixel.setup.optional")}
              events={[...GOOGLE_PIXEL_OPTIONAL_EVENTS]}
              selected={selectedEvents}
              onToggle={toggleEvent}
              onSelectAll={(selectAll) =>
                toggleGroup(GOOGLE_PIXEL_OPTIONAL_EVENTS, selectAll)
              }
              labelOf={(event) => t(`googlePixel.setup.events.${event}`)}
            />
            <div
              style={{
                border: `1px solid ${pageColorTokens.border}`,
                borderRadius: 8,
                padding: 14,
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div>
                <strong style={{ fontSize: 13 }}>{t("googlePixelOnboarding.enhancedTitle")}</strong>
                <p style={{ ...pageHintTextStyle, marginTop: 4 }}>
                  {t("googlePixelOnboarding.enhancedBody")}
                </p>
              </div>
              <button
                type="button"
                style={enhanced ? primaryBtn : secondaryBtn}
                onClick={() => setEnhanced(!enhanced)}
              >
                {enhanced
                  ? t("googlePixelOnboarding.enhancedOn")
                  : t("googlePixelOnboarding.enhancedOff")}
              </button>
            </div>
            <p style={pageHintTextStyle}>{t("googlePixel.setup.embedReminder")}</p>
            <a href={themeEditorUrl} target="_blank" rel="noreferrer" style={secondaryBtn}>
              {t("googlePixelOnboarding.enableAppEmbed")}
            </a>
            {selectedEvents.includes("purchase") ? (
              <p style={pageHintTextStyle}>{t("googlePixel.setup.purchaseReminder")}</p>
            ) : null}
          </>
        )}

        {error ? <div style={{ color: pageColorTokens.critical, fontSize: 13 }}>{error}</div> : null}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          {step === 2 ? (
            <button type="button" style={secondaryBtn} disabled={busy} onClick={() => setStep(1)}>
              {t("googlePixelOnboarding.navBack")}
            </button>
          ) : (
            <span />
          )}
          {step === 1 ? (
            <button
              type="button"
              style={primaryBtn}
              disabled={!props.connected || !selectedAccountId || busy}
              onClick={() => setStep(2)}
            >
              {t("googlePixel.setup.proceed")}
            </button>
          ) : (
            <button
              type="button"
              style={{
                ...primaryBtn,
                opacity: selectedEvents.length === 0 || busy ? 0.5 : 1,
              }}
              disabled={selectedEvents.length === 0 || busy}
              onClick={() => void save()}
            >
              {busy ? t("googlePixelOnboarding.saving") : t("googlePixel.setup.save")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EventGroup(props: {
  title: string;
  events: GooglePixelSetupEvent[];
  selected: GooglePixelSetupEvent[];
  onToggle: (event: GooglePixelSetupEvent) => void;
  onSelectAll: (selectAll: boolean) => void;
  labelOf: (event: GooglePixelSetupEvent) => string;
}) {
  const { t } = useTranslation();
  const allSelected = props.events.every((event) => props.selected.includes(event));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontSize: 13 }}>{props.title}</strong>
        <button type="button" style={secondaryBtn} onClick={() => props.onSelectAll(!allSelected)}>
          {allSelected ? t("googlePixel.setup.deselectAll") : t("googlePixel.setup.selectAll")}
        </button>
      </div>
      {props.events.map((event) => (
        <label key={event} style={{ display: "flex", gap: 10, fontSize: 13, alignItems: "flex-start" }}>
          <input
            type="checkbox"
            checked={props.selected.includes(event)}
            onChange={() => props.onToggle(event)}
            style={{ marginTop: 3 }}
          />
          <span>
            <strong>{props.labelOf(event)}</strong>
            <div style={{ color: pageColorTokens.textSecondary, marginTop: 2 }}>
              {t(`googlePixel.setup.eventHints.${event}`)}
            </div>
          </span>
        </label>
      ))}
    </div>
  );
}
