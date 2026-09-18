import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
// 审核期临时关闭 5.1.5：隐藏 Google Pixel 入口，过审后恢复 Link。
// import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useOAuthPopup } from "../../../hooks/useOAuthPopup";
import { GMC_MERCHANT_SIGNUP_URL } from "../../../lib/gmcOAuthErrors";
import { pageColorTokens, pageHintTextStyle } from "../../page/pageUiStyles";
import { Ga4ConnectPanel } from "./Ga4ConnectPanel";
import { GscConnectPanel } from "./GscConnectPanel";
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

const panelStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  padding: 20,
  background: pageColorTokens.surface,
  display: "flex",
  flexDirection: "column",
  gap: 0,
};

const primaryBtn: CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  background: pageColorTokens.brandGreen,
  color: "#fff",
  border: "none",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

/** 隶属「连接 Google」的分项入口：同色系浅底，主按钮更深 */
const softConnectBtn: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  background: pageColorTokens.brandGreenLight,
  color: pageColorTokens.brandGreenDeep,
  border: `1px solid ${pageColorTokens.brandGreen}`,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryBtn: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  background: "#fff",
  color: pageColorTokens.textPrimary,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const activeAccountBtn: CSSProperties = {
  ...secondaryBtn,
  border: "1px solid #0f7a52",
  background: "#f4fbf7",
  color: "#0f7a52",
  cursor: "default",
  textAlign: "left",
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
  const gmcOAuth = useOAuthPopup("gmc_oauth");
  const adsOAuth = useOAuthPopup("ads_catalog_oauth");
  const anyRedirecting =
    googleOAuth.redirecting || gmcOAuth.redirecting || adsOAuth.redirecting;

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

  function reauthSuffix(reauth: boolean) {
    return reauth ? `${locationSearch ? "&" : "?"}reauth=1` : "";
  }

  function openOAuth(
    endpoint: string,
    oauth: ReturnType<typeof useOAuthPopup>,
    reauth = false,
  ) {
    void (async () => {
      setBusy(true);
      try {
        await oauth.startOAuth(
          `${endpoint}${locationSearch}${reauthSuffix(reauth)}`,
          () => onChanged(),
        );
      } catch (e) {
        alert(e instanceof Error ? e.message : t("adsCatalog.authError"));
      } finally {
        setBusy(false);
      }
    })();
  }

  function openCombinedOAuth(reauth = false) {
    openOAuth("/api/ads-catalog/google-auth-url", googleOAuth, reauth);
  }

  function openGmcOAuth(reauth = false) {
    openOAuth("/api/ads-catalog/google-merchant-auth-url", gmcOAuth, reauth);
  }

  function openAdsOAuth(reauth = false) {
    openOAuth("/api/ads-catalog/google-ads-auth-url", adsOAuth, reauth);
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

  const disabled = busy || anyRedirecting;

  return (
    <div style={panelStyle}>
      {showPrimaryConnect ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
            {t("adsCatalog.googleConnectTitle")}
          </h3>
          <p style={{ ...pageHintTextStyle, margin: 0 }}>{t("adsCatalog.googleConnectHint")}</p>
          <div>
            <button
              type="button"
              style={primaryBtn}
              disabled={disabled}
              onClick={() => openCombinedOAuth()}
            >
              {t("adsCatalog.googleConnect")}
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Google Merchant Center ── */}
      <ServiceSection title={t("adsCatalog.gmcPanelTitle")} bordered={showPrimaryConnect}>
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
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                style={secondaryBtn}
                disabled={disabled}
                onClick={() => openGmcOAuth(true)}
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
        ) : (
          <ServiceIdleRow
            hint={
              <>
                {showPrimaryConnect
                  ? t("adsCatalog.gmcConnectHint")
                  : t("adsCatalog.gmcConnectSideHint")}{" "}
                <a
                  href={GMC_MERCHANT_SIGNUP_URL}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "inherit", fontWeight: 700 }}
                >
                  {t("adsCatalog.gmcNoMerchantAccountGuideLink")}
                </a>
              </>
            }
            action={
              <button
                type="button"
                style={softConnectBtn}
                disabled={disabled}
                onClick={() => openGmcOAuth()}
              >
                {t("adsCatalog.gmcConnect")}
              </button>
            }
          />
        )}
      </ServiceSection>

      {/* ── Google Ads (optional) ── */}
      <ServiceSection title={t("adsCatalog.adsPanelTitle")}>
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
                  style={isActive ? activeAccountBtn : { ...secondaryBtn, textAlign: "left" }}
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
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                style={secondaryBtn}
                disabled={disabled}
                onClick={() => openAdsOAuth(true)}
              >
                {t("adsCatalog.adsReauth")}
              </button>
              <button
                type="button"
                style={secondaryBtn}
                disabled={busy}
                onClick={() => void post("/api/ads-catalog/google-disconnect", { target: "ads" })}
              >
                {t("adsCatalog.adsDisconnect")}
              </button>
            </div>
          </>
        ) : selectingInitialAds ? null : (
          <ServiceIdleRow
            hint={
              showPrimaryConnect
                ? t("adsCatalog.adsConnectHint")
                : t("adsCatalog.adsConnectSideHint")
            }
            action={
              <button
                type="button"
                style={softConnectBtn}
                disabled={disabled}
                onClick={() => openAdsOAuth()}
              >
                {t("adsCatalog.adsConnect")}
              </button>
            }
          />
        )}
      </ServiceSection>

      <Ga4ConnectPanel
        credentials={credentials}
        locationSearch={locationSearch}
        languageCode={languageCode}
        onChanged={onChanged}
        layout="section"
      />
      <GscConnectPanel
        credentials={credentials}
        locationSearch={locationSearch}
        languageCode={languageCode}
        onChanged={onChanged}
        layout="section"
      />
      {/* 审核期临时关闭 5.1.5：隐藏 Google Pixel 向导入口。过审后恢复本面板。 */}
    </div>
  );
}

function ServiceSection({
  title,
  children,
  bordered = true,
}: {
  title: string;
  children: ReactNode;
  bordered?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        paddingTop: 14,
        paddingBottom: 14,
        borderTop: bordered ? `1px solid ${pageColorTokens.borderSubtle}` : undefined,
      }}
    >
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{title}</h3>
      {children}
    </div>
  );
}

function ServiceIdleRow({ hint, action }: { hint: ReactNode; action: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ ...pageHintTextStyle, margin: 0 }}>{hint}</div>
      <div>{action}</div>
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
