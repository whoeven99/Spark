import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens, pageHintTextStyle } from "../../page/pageUiStyles";

type EmbedState = {
  enabled: boolean;
  unavailable: boolean;
  loading: boolean;
};

type Props = {
  metaConnected: boolean;
  metaAdsConnected: boolean;
  pixelId: string;
  hasCapiAccessToken: boolean;
  hasStoredCapiAccessToken: boolean;
  capiEnabled: boolean;
  locationSearch: string;
  themeEditorUrl: string | null;
  onConnectMetaAds: () => void;
  busy: boolean;
  /** Pixel 保存成功后递增，用于刷新 Embed 检测。 */
  setupRevision?: number;
};

type WizardStepId = "meta" | "metaAds" | "pixel" | "embed";

type WizardStep = {
  id: WizardStepId;
  optional?: boolean;
  done: boolean;
  current: boolean;
};

const secondaryBtn = {
  padding: "6px 10px",
  borderRadius: 8,
  background: "#fff",
  color: pageColorTokens.textPrimary,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

function stepCircle(done: boolean, current: boolean): CSSProperties {
  if (done) {
    return {
      width: 22,
      height: 22,
      borderRadius: "50%",
      background: pageColorTokens.brandGreen,
      color: "#fff",
      fontSize: 12,
      fontWeight: 700,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    };
  }
  if (current) {
    return {
      width: 22,
      height: 22,
      borderRadius: "50%",
      background: "#fff",
      color: pageColorTokens.textPrimary,
      border: `2px solid ${pageColorTokens.brandGreen}`,
      fontSize: 11,
      fontWeight: 700,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    };
  }
  return {
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: pageColorTokens.surfaceMuted,
    color: pageColorTokens.textSecondary,
    border: `1px solid ${pageColorTokens.borderSubtle}`,
    fontSize: 11,
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };
}

export function MetaPixelSetupWizard({
  metaConnected,
  metaAdsConnected,
  pixelId,
  hasCapiAccessToken,
  hasStoredCapiAccessToken,
  capiEnabled,
  locationSearch,
  themeEditorUrl,
  onConnectMetaAds,
  busy,
  setupRevision = 0,
}: Props) {
  const { t } = useTranslation();
  const [embed, setEmbed] = useState<EmbedState>({
    enabled: false,
    unavailable: false,
    loading: true,
  });

  const refreshEmbed = useCallback(async () => {
    setEmbed((prev) => ({ ...prev, loading: true }));
    try {
      const resp = await fetch(`/api/ads-catalog/meta-embed-status${locationSearch}`);
      const json = (await resp.json()) as {
        enabled?: boolean;
        unavailable?: boolean;
      };
      setEmbed({
        enabled: Boolean(json.enabled),
        unavailable: Boolean(json.unavailable),
        loading: false,
      });
    } catch {
      setEmbed({ enabled: false, unavailable: true, loading: false });
    }
  }, [locationSearch]);

  useEffect(() => {
    void refreshEmbed();
  }, [refreshEmbed, pixelId, hasCapiAccessToken, setupRevision]);

  const pixelReady = Boolean(pixelId.trim() && hasCapiAccessToken && capiEnabled);
  const embedReady = embed.enabled;

  const steps = useMemo((): WizardStep[] => {
    const metaDone = metaConnected;
    const metaAdsDone = metaAdsConnected;
    const pixelDone = pixelReady;
    const embedDone = embedReady;

    let currentId: WizardStepId = "embed";
    if (!metaDone) currentId = "meta";
    else if (!pixelDone) currentId = "pixel";
    else if (!embedDone && !embed.unavailable) currentId = "embed";
    else if (!metaAdsDone) currentId = "metaAds";

    const list: WizardStep[] = [
      { id: "meta", done: metaDone, current: currentId === "meta" },
      { id: "metaAds", optional: true, done: metaAdsDone, current: currentId === "metaAds" },
      { id: "pixel", done: pixelDone, current: currentId === "pixel" },
      { id: "embed", done: embedDone, current: currentId === "embed" },
    ];
    return list;
  }, [metaConnected, metaAdsConnected, pixelReady, embedReady, embed.unavailable]);

  const allRequiredDone = metaConnected && pixelReady && (embedReady || embed.unavailable);

  const stepLabel: Record<WizardStepId, string> = {
    meta: t("adsCatalog.metaPixelWizardStepMeta"),
    metaAds: t("adsCatalog.metaPixelWizardStepMetaAds"),
    pixel: t("adsCatalog.metaPixelWizardStepPixel"),
    embed: t("adsCatalog.metaPixelWizardStepEmbed"),
  };

  return (
    <div
      style={{
        border: `1px solid ${pageColorTokens.borderSubtle}`,
        borderRadius: 8,
        padding: "12px 14px",
        background: pageColorTokens.surfaceSubtle,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{t("adsCatalog.metaPixelWizardTitle")}</div>
        <p style={{ ...pageHintTextStyle, margin: "4px 0 0" }}>
          {t("adsCatalog.metaPixelWizardSubtitle")}
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 8,
        }}
      >
        {steps.map((step, index) => (
          <div
            key={step.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              padding: "8px 10px",
              borderRadius: 8,
              background: step.current ? "#fff" : "transparent",
              border: step.current
                ? `1px solid ${pageColorTokens.brandGreen}`
                : "1px solid transparent",
            }}
          >
            <span style={stepCircle(step.done, step.current)}>{step.done ? "✓" : index + 1}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: step.current ? 700 : 600 }}>
                {stepLabel[step.id]}
              </div>
              <div style={{ fontSize: 11, color: pageColorTokens.textSecondary, marginTop: 2 }}>
                {step.done
                  ? t("adsCatalog.metaPixelWizardStepDone")
                  : step.optional
                    ? t("adsCatalog.metaPixelWizardStepOptional")
                    : step.current
                      ? t("adsCatalog.metaPixelWizardStepCurrent")
                      : ""}
              </div>
            </div>
          </div>
        ))}
      </div>

      {allRequiredDone ? (
        <div
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            background: pageColorTokens.brandGreenLight,
            color: pageColorTokens.brandGreenDeep,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {t("adsCatalog.metaPixelWizardComplete")}
          <div style={{ fontWeight: 500, marginTop: 4, opacity: 0.9 }}>
            {t("adsCatalog.metaPixelWizardCompleteHint")}
          </div>
        </div>
      ) : null}

      {pixelReady && hasStoredCapiAccessToken ? (
        <div style={{ fontSize: 12, color: "#0f7a52", fontWeight: 600 }}>
          {t("adsCatalog.metaPixelCapiBoundBadge")}
        </div>
      ) : null}

      {!metaAdsConnected && steps.some((s) => s.id === "metaAds" && s.current) ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
            {t("adsCatalog.metaPixelConnectAdsHint")}
          </span>
          <button type="button" style={secondaryBtn} disabled={busy} onClick={onConnectMetaAds}>
            {t("adsCatalog.metaPixelConnectAds")}
          </button>
        </div>
      ) : null}

      {steps.some((s) => s.id === "embed" && s.current) && !embed.loading && !embed.enabled ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
            {t("adsCatalog.metaPixelAppThemeHint")}
          </span>
          <button
            type="button"
            style={secondaryBtn}
            disabled={!themeEditorUrl}
            onClick={() => {
              if (themeEditorUrl) window.open(themeEditorUrl, "_blank", "noopener,noreferrer");
            }}
          >
            {t("adsCatalog.metaPixelWizardEmbedAction")}
          </button>
          <button type="button" style={secondaryBtn} disabled={busy} onClick={() => void refreshEmbed()}>
            {t("adsCatalog.metaPixelWizardRefreshEmbed")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
