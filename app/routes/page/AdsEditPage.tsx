import { useState, useEffect } from "react";
import { useFetcher, useLoaderData, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
  PageHeaderNav,
  PageSurface,
  pageColorTokens,
  pageContentStyle,
} from "./pageUiStyles";
import { SegmentedPageTabs } from "../component/shared/SegmentedPageTabs";
import { MetaAdsEditForm } from "../component/adsEdit/MetaAdsEditForm";
import { TiktokAdsEditForm } from "../component/adsEdit/TiktokAdsEditForm";
import { GoogleAdsEditForm } from "../component/adsEdit/GoogleAdsEditForm";
import type {
  AdsEditPlatform,
  AdsListApiResponse,
  AdsListCampaign,
  AdsListAdSet,
  AdsListAd,
  MetaAdsEditDetail,
  TiktokAdsEditDetail,
  GoogleAdsEditDetail,
  AdsEditLoaderData,
} from "../component/adsEdit/types";

type SelectionStep = "campaign" | "adset" | "ad" | "edit";

export function AdsEditPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const loaderData = useLoaderData<AdsEditLoaderData>();
  const locationSearch = location.search || "";

  const [platform, setPlatform] = useState<AdsEditPlatform>("meta");
  const [step, setStep] = useState<SelectionStep>("campaign");

  const [campaigns, setCampaigns] = useState<AdsListCampaign[]>([]);
  const [adSets, setAdSets] = useState<AdsListAdSet[]>([]);
  const [ads, setAds] = useState<AdsListAd[]>([]);

  const [selectedCampaign, setSelectedCampaign] = useState<AdsListCampaign | null>(null);
  const [selectedAdSet, setSelectedAdSet] = useState<AdsListAdSet | null>(null);
  const [selectedAd, setSelectedAd] = useState<AdsListAd | null>(null);

  const [detail, setDetail] = useState<MetaAdsEditDetail | TiktokAdsEditDetail | GoogleAdsEditDetail | null>(null);
  const [editSucceeded, setEditSucceeded] = useState(false);

  const listFetcher = useFetcher<AdsListApiResponse>();
  const detailFetcher = useFetcher<AdsListApiResponse>();

  const isLoading = listFetcher.state !== "idle";
  const isDetailLoading = detailFetcher.state !== "idle";

  const connections: Record<AdsEditPlatform, boolean> = {
    meta: loaderData.meta.connected,
    tiktok: loaderData.tiktok.connected,
    google: loaderData.google.connected,
  };

  const platformTabs = [
    { key: "meta" as const, label: t("adsCreate.tabMeta") },
    { key: "tiktok" as const, label: t("adsCreate.tabTiktok") },
    { key: "google" as const, label: t("adsCreate.tabGoogle") },
  ];

  // 切换平台时重置选择
  function handlePlatformChange(p: AdsEditPlatform) {
    setPlatform(p);
    resetSelection();
  }

  function resetSelection() {
    setStep("campaign");
    setCampaigns([]);
    setAdSets([]);
    setAds([]);
    setSelectedCampaign(null);
    setSelectedAdSet(null);
    setSelectedAd(null);
    setDetail(null);
    setEditSucceeded(false);
  }

  // 加载 campaign 列表
  function loadCampaigns() {
    listFetcher.load(
      `/api/ads-edit.list${locationSearch}&platform=${platform}&level=campaigns`,
    );
  }

  // 响应 campaign 列表结果
  useEffect(() => {
    if (listFetcher.data && step === "campaign") {
      const resp = listFetcher.data;
      if (resp.ok && resp.campaigns) {
        setCampaigns(resp.campaigns);
      }
    }
    if (listFetcher.data && step === "adset") {
      const resp = listFetcher.data;
      if (resp.ok && resp.adSets) {
        setAdSets(resp.adSets);
      }
    }
    if (listFetcher.data && step === "ad") {
      const resp = listFetcher.data;
      if (resp.ok && resp.ads) {
        setAds(resp.ads);
      }
    }
  }, [listFetcher.data]);

  // 响应详情结果
  useEffect(() => {
    if (detailFetcher.data?.ok && detailFetcher.data.detail) {
      setDetail(detailFetcher.data.detail);
      setStep("edit");
    }
  }, [detailFetcher.data]);

  function handleCampaignSelect(campaign: AdsListCampaign) {
    setSelectedCampaign(campaign);
    setSelectedAdSet(null);
    setSelectedAd(null);
    setAdSets([]);
    setAds([]);
    setStep("adset");
    listFetcher.load(
      `/api/ads-edit.list${locationSearch}&platform=${platform}&level=adsets&campaignId=${campaign.id}`,
    );
  }

  function handleAdSetSelect(adSet: AdsListAdSet) {
    setSelectedAdSet(adSet);
    setSelectedAd(null);
    setAds([]);
    setStep("ad");
    listFetcher.load(
      `/api/ads-edit.list${locationSearch}&platform=${platform}&level=ads&adSetId=${adSet.id}`,
    );
  }

  function handleAdSelect(ad: AdsListAd) {
    setSelectedAd(ad);
    setDetail(null);
    detailFetcher.load(
      `/api/ads-edit.list${locationSearch}&platform=${platform}&level=detail&adId=${ad.id}`,
    );
  }

  function handleEditSuccess() {
    setEditSucceeded(true);
  }

  const currentConnected = connections[platform];

  const connectLinks: Record<AdsEditPlatform, string> = {
    meta: locationSearch
      ? `/app/ads-catalog${locationSearch}&tab=credentials&platform=facebook`
      : "/app/ads-catalog?tab=credentials&platform=facebook",
    tiktok: locationSearch
      ? `/app/ads-catalog${locationSearch}&tab=credentials&platform=tiktok`
      : "/app/ads-catalog?tab=credentials&platform=tiktok",
    google: locationSearch
      ? `/app/ads-catalog${locationSearch}&tab=credentials&platform=google`
      : "/app/ads-catalog?tab=credentials&platform=google",
  };

  const connectLabels: Record<AdsEditPlatform, string> = {
    meta: t("adsCreate.goConnectMeta"),
    tiktok: t("adsCreate.goConnectTiktok"),
    google: t("adsCreate.goConnectGoogle"),
  };

  return (
    <PageSurface>
      <PageHeaderNav
        workspaceOnly={false}
        backLabel={t("settingsShell.back")}
        fallbackPath="/app/settings"
        title={t("adsEdit.pageTitle")}
        subtitle={t("adsEdit.pageSubtitle")}
      />

      <div style={pageContentStyle}>
        <SegmentedPageTabs
          activeTab={platform}
          onTabChange={handlePlatformChange}
          ariaLabel={t("adsCreate.platformTabsAria")}
          items={platformTabs}
        />

        {/* 未连接状态 */}
        {!currentConnected && (
          <div style={notConnectedStyle}>
            <span>{t(`adsCreate.${platform}.notConnected`)}</span>
            <Link
              to={connectLinks[platform]}
              style={{ color: pageColorTokens.brandBlueDark, fontWeight: 600, fontSize: 13 }}
            >
              {connectLabels[platform]}
            </Link>
          </div>
        )}

        {/* 已连接 — 三级选择 */}
        {currentConnected && step !== "edit" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* 面包屑路径 */}
            {selectedCampaign && (
              <BreadcrumbBar
                items={[
                  selectedCampaign.name,
                  ...(selectedAdSet ? [selectedAdSet.name] : []),
                  ...(selectedAd ? [selectedAd.name] : []),
                ]}
                onReset={resetSelection}
                t={t}
              />
            )}

            {/* 加载按钮 / 第一步 */}
            {step === "campaign" && campaigns.length === 0 && !isLoading && (
              <div style={selectPromptStyle}>
                <p style={{ margin: 0, fontSize: 14, color: pageColorTokens.textSecondary }}>
                  {t("adsEdit.promptLoadCampaigns")}
                </p>
                <button style={loadBtnStyle} onClick={loadCampaigns}>
                  {t("adsEdit.loadCampaigns")}
                </button>
              </div>
            )}

            {isLoading && <LoadingIndicator t={t} />}

            {!isLoading && campaigns.length > 0 && step === "campaign" && (
              <SelectionList
                title={t("adsEdit.selectCampaign")}
                items={campaigns}
                onSelect={handleCampaignSelect}
              />
            )}

            {!isLoading && step === "adset" && adSets.length === 0 && (
              <EmptyHint msg={t("adsEdit.noAdSets")} />
            )}

            {!isLoading && step === "adset" && adSets.length > 0 && (
              <SelectionList
                title={t("adsEdit.selectAdSet")}
                items={adSets}
                onSelect={handleAdSetSelect}
              />
            )}

            {!isLoading && step === "ad" && ads.length === 0 && (
              <EmptyHint msg={t("adsEdit.noAds")} />
            )}

            {!isLoading && step === "ad" && ads.length > 0 && (
              <SelectionList
                title={t("adsEdit.selectAd")}
                items={ads}
                onSelect={handleAdSelect}
              />
            )}

            {isDetailLoading && <LoadingIndicator t={t} />}
          </div>
        )}

        {/* 编辑表单 */}
        {currentConnected && step === "edit" && detail && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <BreadcrumbBar
                items={[
                  selectedCampaign?.name ?? "",
                  selectedAdSet?.name ?? "",
                  selectedAd?.name ?? "",
                ].filter(Boolean)}
                onReset={resetSelection}
                t={t}
              />
              <button style={backBtnStyle} onClick={resetSelection}>
                ← {t("adsEdit.backToSelect")}
              </button>
            </div>

            {editSucceeded && (
              <div style={successBannerStyle}>{t("adsEdit.successMsg")}</div>
            )}

            {platform === "meta" && (
              <MetaAdsEditForm
                detail={detail as MetaAdsEditDetail}
                locationSearch={locationSearch}
                onSuccess={handleEditSuccess}
              />
            )}
            {platform === "tiktok" && (
              <TiktokAdsEditForm
                detail={detail as TiktokAdsEditDetail}
                locationSearch={locationSearch}
                onSuccess={handleEditSuccess}
              />
            )}
            {platform === "google" && (
              <GoogleAdsEditForm
                detail={detail as GoogleAdsEditDetail}
                locationSearch={locationSearch}
                onSuccess={handleEditSuccess}
              />
            )}
          </div>
        )}
      </div>
    </PageSurface>
  );
}

// ─── 子组件 ───────────────────────────────────────────────────────────────────

interface SelectionListProps {
  title: string;
  items: Array<{ id: string; name: string; status: string }>;
  onSelect: (item: { id: string; name: string; status: string }) => void;
}

function SelectionList({ title, items, onSelect }: SelectionListProps) {
  return (
    <div style={cardStyle}>
      <h3 style={cardTitleStyle}>{title}</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((item) => (
          <button
            key={item.id}
            style={itemBtnStyle}
            onClick={() => onSelect(item)}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: pageColorTokens.textPrimary }}>
                {item.name || item.id}
              </span>
              <span style={{ fontSize: 11, color: pageColorTokens.textSecondary }}>
                ID: {item.id}
              </span>
            </div>
            <StatusBadge status={item.status} />
          </button>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isActive = /ACTIVE|ENABLE|ENABLED/i.test(status);
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 999,
        background: isActive ? pageColorTokens.brandGreenLight : pageColorTokens.surfaceMuted,
        color: isActive ? pageColorTokens.brandGreenDeep : pageColorTokens.textSecondary,
        flexShrink: 0,
      }}
    >
      {status}
    </span>
  );
}

interface BreadcrumbBarProps {
  items: string[];
  onReset: () => void;
  t: (key: string) => string;
}

function BreadcrumbBar({ items, onReset, t }: BreadcrumbBarProps) {
  return (
    <div style={breadcrumbStyle}>
      <button
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: pageColorTokens.brandBlueDark, fontSize: 12, fontWeight: 600 }}
        onClick={onReset}
      >
        {t("adsEdit.allCampaigns")}
      </button>
      {items.map((item, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: pageColorTokens.textSecondary, fontSize: 12 }}>›</span>
          <span style={{ fontSize: 12, color: i === items.length - 1 ? pageColorTokens.textPrimary : pageColorTokens.textSecondary, fontWeight: i === items.length - 1 ? 600 : 400 }}>
            {item}
          </span>
        </span>
      ))}
    </div>
  );
}

function LoadingIndicator({ t }: { t: (key: string) => string }) {
  return (
    <div style={{ textAlign: "center", padding: 24, color: pageColorTokens.textSecondary, fontSize: 13 }}>
      {t("adsEdit.loading")}
    </div>
  );
}

function EmptyHint({ msg }: { msg: string }) {
  return (
    <div style={{ textAlign: "center", padding: 24, color: pageColorTokens.textSecondary, fontSize: 13 }}>
      {msg}
    </div>
  );
}

// ─── 样式 ─────────────────────────────────────────────────────────────────────

const notConnectedStyle = {
  background: pageColorTokens.criticalBg,
  color: pageColorTokens.criticalText,
  padding: "12px 16px",
  borderRadius: pageColorTokens.radiusControl,
  fontSize: 13,
  display: "flex",
  flexWrap: "wrap" as const,
  gap: 10,
  alignItems: "center",
};

const selectPromptStyle = {
  background: pageColorTokens.surfaceMuted,
  border: `1px dashed ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  padding: 24,
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  gap: 12,
};

const loadBtnStyle = {
  padding: "10px 20px",
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.brandGreen,
  color: "#fff",
  border: "none",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const cardStyle = {
  background: pageColorTokens.surface,
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  padding: 16,
  boxShadow: pageColorTokens.shadowCard,
};

const cardTitleStyle = {
  margin: "0 0 12px",
  fontSize: 14,
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const itemBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 14px",
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: pageColorTokens.radiusControl,
  cursor: "pointer",
  textAlign: "left",
  width: "100%",
  transition: "background 0.15s",
};

const breadcrumbStyle = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  flexWrap: "wrap" as const,
};

const backBtnStyle = {
  padding: "6px 12px",
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surface,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  color: pageColorTokens.textPrimary,
  flexShrink: 0,
};

const successBannerStyle = {
  background: pageColorTokens.brandGreenLight,
  color: pageColorTokens.brandGreenDeep,
  padding: "10px 16px",
  borderRadius: pageColorTokens.radiusControl,
  fontSize: 13,
  fontWeight: 600,
};
