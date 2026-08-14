import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useOAuthPopup } from "../../../hooks/useOAuthPopup";
import { pageColorTokens, pageHintTextStyle } from "../../page/pageUiStyles";
import type { CredentialsView } from "./types";

type AdsLink = {
  bound: boolean;
  customerId: string | null;
  state: "not_linked" | "pending" | "linked" | "failed" | null;
  error?: string;
};

type Props = {
  credentials: CredentialsView;
  adsLink: AdsLink | null;
  locationSearch: string;
  languageCode: string;
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

const primaryBtn = {
  padding: "10px 16px",
  borderRadius: 8,
  background: pageColorTokens.brandGreen,
  color: "#fff",
  border: "none",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryBtn = {
  padding: "10px 16px",
  borderRadius: 8,
  background: "#fff",
  color: pageColorTokens.textPrimary,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const activeAccountBtn = {
  ...secondaryBtn,
  border: `1px solid #0f7a52`,
  background: "#f4fbf7",
  color: "#0f7a52",
  cursor: "default",
  textAlign: "left" as const,
};

type AdsAccountOption = { id: string; name?: string; formatted?: string };

export function GoogleConnectPanels({
  credentials,
  adsLink,
  locationSearch,
  languageCode,
  onChanged,
}: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const googleOAuth = useOAuthPopup("google_oauth");

  const gmc = credentials.googleMerchant;
  const ads = credentials.googleAds;
  const [adsAccounts, setAdsAccounts] = useState<AdsAccountOption[]>(() =>
    ads.pendingAccounts.length > 0 ? ads.pendingAccounts : ads.availableAccounts,
  );
  const showPrimaryConnect =
    !gmc.connected &&
    !ads.connected &&
    gmc.pendingAccounts.length === 0 &&
    ads.pendingAccounts.length === 0;

  useEffect(() => {
    if (ads.pendingAccounts.length > 0) {
      setAdsAccounts(ads.pendingAccounts);
      return;
    }
    if (ads.availableAccounts.length > 0) {
      setAdsAccounts(ads.availableAccounts);
      return;
    }
    if (!ads.connected) {
      setAdsAccounts([]);
      return;
    }

    let cancelled = false;
    void fetch(`/api/ads-catalog/google-ads-accounts${locationSearch}`)
      .then((resp) => resp.json())
      .then((data: { ok?: boolean; accounts?: AdsAccountOption[] }) => {
        if (!cancelled && data.ok && Array.isArray(data.accounts)) {
          setAdsAccounts(data.accounts);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ads.availableAccounts, ads.connected, ads.pendingAccounts, locationSearch]);

  async function selectAdsAccount(customerId: string) {
    if (ads.connected && customerId === ads.customerId) return;
    await post("/api/ads-catalog/google-ads-accounts", { customerId });
  }

  const selectingInitialAds = !ads.connected && ads.pendingAccounts.length > 0;
  const showAdsAccountPicker =
    selectingInitialAds || (ads.connected && adsAccounts.length > 0) || ads.pendingAccounts.length > 0;

  function openCombinedOAuth(reauth = false) {
    const reauthSuffix = reauth ? `${locationSearch ? "&" : "?"}reauth=1` : "";
    void (async () => {
      setBusy(true);
      try {
        await googleOAuth.startOAuth(
          `/api/ads-catalog/google-auth-url${locationSearch}${reauthSuffix}`,
          () => onChanged(),
        );
      } catch (e) {
        alert(e instanceof Error ? e.message : t("adsCatalog.authError"));
      } finally {
        setBusy(false);
      }
    })();
  }

  async function post(path: string, body: Record<string, unknown>) {
    setBusy(true);
    try {
      const resp = await fetch(`${path}${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (resp.ok && data.ok) onChanged();
      else if (data.error) alert(data.error);
    } finally {
      setBusy(false);
    }
  }

  const fmtDate = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat(languageCode, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(iso))
      : "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {showPrimaryConnect ? (
        <div style={panelStyle}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
            {t("adsCatalog.googleConnectTitle")}
          </h3>
          <p style={pageHintTextStyle}>{t("adsCatalog.googleConnectHint")}</p>
          <div>
            <button
              type="button"
              style={primaryBtn}
              disabled={busy || googleOAuth.redirecting}
              onClick={() => openCombinedOAuth()}
            >
              {t("adsCatalog.googleConnect")}
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Google Merchant Center ── */}
      <div style={panelStyle}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
          {t("adsCatalog.gmcPanelTitle")}
        </h3>

        {gmc.pendingAccounts.length > 0 ? (
          <AccountSelect
            label={t("adsCatalog.gmcSelectAccount")}
            accounts={gmc.pendingAccounts.map((a) => ({ id: a.id, label: a.name || a.id }))}
            busy={busy}
            onSelect={(id) =>
              void post("/api/ads-catalog/google-merchant-accounts", { merchantId: id })
            }
          />
        ) : gmc.connected ? (
          <>
            <div style={{ fontSize: 13 }}>
              <div style={{ color: "#0f7a52", fontWeight: 600 }}>
                {t("adsCatalog.gmcConnected")}
              </div>
              <div>{t("adsCatalog.gmcMerchantId", { id: gmc.merchantId })}</div>
              <div style={pageHintTextStyle}>
                {t("adsCatalog.gmcUpdatedAt", { time: fmtDate(gmc.updatedAt) })}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                style={secondaryBtn}
                disabled={busy || googleOAuth.redirecting}
                onClick={() => openCombinedOAuth(true)}
              >
                {t("adsCatalog.gmcReauth")}
              </button>
              <button
                type="button"
                style={secondaryBtn}
                disabled={busy}
                onClick={() => void post("/api/ads-catalog/google-disconnect", { target: "gmc" })}
              >
                {t("adsCatalog.gmcDisconnect")}
              </button>
            </div>
          </>
        ) : showPrimaryConnect ? (
          <p style={pageHintTextStyle}>{t("adsCatalog.gmcConnectHint")}</p>
        ) : (
          <>
            <p style={pageHintTextStyle}>{t("adsCatalog.gmcConnectSideHint")}</p>
            <div>
              <button
                type="button"
                style={secondaryBtn}
                disabled={busy || googleOAuth.redirecting}
                onClick={() => openCombinedOAuth()}
              >
                {t("adsCatalog.googleConnect")}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Google Ads (optional) ── */}
      <div style={panelStyle}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
          {t("adsCatalog.adsPanelTitle")}
        </h3>

        {showAdsAccountPicker ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {selectingInitialAds
                ? t("adsCatalog.adsSelectAccount")
                : t("adsCatalog.adsSwitchAccount")}
            </div>
            {adsAccounts.map((a) => {
              const isActive = ads.connected && a.id === ads.customerId;
              const label = a.name
                ? `${a.name} (${a.formatted || a.id})`
                : a.formatted || a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  disabled={busy || isActive}
                  style={isActive ? activeAccountBtn : { ...secondaryBtn, textAlign: "left" as const }}
                  onClick={() => void selectAdsAccount(a.id)}
                >
                  {label}
                  {isActive ? ` · ${t("adsCatalog.adsCurrentAccount")}` : ""}
                </button>
              );
            })}
          </div>
        ) : null}

        {ads.connected ? (
          <>
            {adsAccounts.length === 0 ? (
              <div style={{ fontSize: 13 }}>
                <div style={{ color: "#0f7a52", fontWeight: 600 }}>{t("adsCatalog.adsBound")}</div>
                <div>
                  {t("adsCatalog.adsCustomerId", {
                    id: ads.customerIdFormatted || ads.customerId,
                  })}
                </div>
              </div>
            ) : null}
            <div style={{ fontSize: 13 }}>
              <div style={{ marginTop: adsAccounts.length > 0 ? 0 : 4 }}>
                {adsLink?.state === "linked" ? (
                  <span style={{ color: "#0f7a52" }}>{t("adsCatalog.adsLinked")}</span>
                ) : adsLink?.state === "pending" ? (
                  <span style={{ color: "#a36a00" }}>{t("adsCatalog.adsLinkPending")}</span>
                ) : adsLink?.state === "not_linked" ? (
                  <button
                    type="button"
                    style={secondaryBtn}
                    disabled={busy}
                    onClick={() =>
                      void post("/api/ads-catalog/google-status", {
                        operation: "ensure_link",
                      })
                    }
                  >
                    {t("adsCatalog.adsCreateLink")}
                  </button>
                ) : (
                  <span style={pageHintTextStyle}>{t("adsCatalog.adsLinkUnknown")}</span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                style={secondaryBtn}
                disabled={busy || googleOAuth.redirecting}
                onClick={() => openCombinedOAuth(true)}
              >
                {t("adsCatalog.gmcReauth")}
              </button>
              <button
                type="button"
                style={secondaryBtn}
                disabled={busy}
                onClick={() => void post("/api/ads-catalog/google-disconnect", { target: "ads" })}
              >
                {t("adsCatalog.gmcDisconnect")}
              </button>
            </div>
          </>
        ) : selectingInitialAds ? null : showPrimaryConnect ? (
          <p style={pageHintTextStyle}>{t("adsCatalog.adsConnectHint")}</p>
        ) : (
          <>
            <p style={pageHintTextStyle}>{t("adsCatalog.adsConnectSideHint")}</p>
            <div>
              <button
                type="button"
                style={secondaryBtn}
                disabled={busy || googleOAuth.redirecting}
                onClick={() => openCombinedOAuth()}
              >
                {t("adsCatalog.googleConnect")}
              </button>
            </div>
          </>
        )}
      </div>
      {/* ── Google Pixel（Nabu 风格三步向导入口）── */}
      <div style={panelStyle}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
          {t("adsCatalog.googlePixelPanelTitle")}
        </h3>
        <p style={pageHintTextStyle}>{t("adsCatalog.googlePixelPanelHint")}</p>
        {ads.remarketing.tagId ? (
          <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ color: pageColorTokens.brandGreenDeep, fontWeight: 600 }}>
              {t("adsCatalog.googlePixelSummaryTag", { tag: ads.remarketing.tagId })}
            </div>
            {ads.remarketing.conversionLabel ? (
              <div>
                {t("adsCatalog.googlePixelSummaryLabel", {
                  label: ads.remarketing.conversionLabel,
                })}
              </div>
            ) : null}
            <div style={pageHintTextStyle}>
              {t("adsCatalog.googlePixelSummaryEvents", {
                count: ads.remarketing.enabledEvents.length,
              })}
            </div>
          </div>
        ) : (
          <p style={pageHintTextStyle}>{t("adsCatalog.googlePixelNotConfigured")}</p>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {ads.remarketing.tagId ? (
            <>
              <Link
                to={`/app/ads/google-pixel/data${locationSearch}`}
                style={{ ...primaryBtn, display: "inline-block", textDecoration: "none" }}
              >
                {t("adsCatalog.googlePixelViewData")}
              </Link>
              <Link
                to={`/app/ads/google-pixel/activity${locationSearch}`}
                style={{ ...secondaryBtn, display: "inline-block", textDecoration: "none" }}
              >
                {t("adsCatalog.googlePixelViewActivity")}
              </Link>
              <Link
                to={`/app/ads/google-pixel${locationSearch}`}
                style={{ ...secondaryBtn, display: "inline-block", textDecoration: "none" }}
              >
                {t("adsCatalog.googlePixelManage")}
              </Link>
            </>
          ) : (
            <Link
              to={`/app/ads/google-pixel${locationSearch}`}
              style={{ ...primaryBtn, display: "inline-block", textDecoration: "none" }}
            >
              {t("adsCatalog.googlePixelSetup")}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function AccountSelect({
  label,
  accounts,
  busy,
  onSelect,
}: {
  label: string;
  accounts: Array<{ id: string; label: string }>;
  busy: boolean;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(accounts[0]?.id ?? "");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          border: `1px solid ${pageColorTokens.borderInput}`,
          fontSize: 13,
        }}
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </select>
      <div>
        <button
          type="button"
          style={primaryBtn}
          disabled={busy || !selected}
          onClick={() => onSelect(selected)}
        >
          {t("adsCatalog.confirmSelection")}
        </button>
      </div>
    </div>
  );
}
