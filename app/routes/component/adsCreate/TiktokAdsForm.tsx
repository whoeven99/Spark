import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  TiktokAdFormData,
  TiktokCreativeMode,
  TiktokObjective,
  TiktokBudgetMode,
} from "./types";
import { formStyles as s, StepIndicator, FormField, SubmitResult } from "./formShared";

const DEFAULT_FORM: TiktokAdFormData = {
  campaignName: "",
  campaignObjective: "TRAFFIC",
  campaignBudgetMode: "BUDGET_MODE_DAY",
  campaignBudget: "",
  campaignStatus: "ENABLE",
  adGroupName: "",
  adGroupBudgetMode: "BUDGET_MODE_DAY",
  adGroupBudget: "",
  adGroupScheduleStart: "",
  adGroupScheduleEnd: "",
  gender: "GENDER_UNLIMITED",
  locationIds: "6252001",
  identityId: "",
  identityType: "",
  identityDisplayName: "",
  adName: "",
  adText: "",
  adCallToAction: "LEARN_MORE",
  creativeMode: "SINGLE_IMAGE",
  adImageUrl: "",
  adVideoUrl: "",
  adImageId: "",
  adVideoId: "",
  tiktokItemId: "",
  adLandingUrl: "",
};

const OBJECTIVES: { value: TiktokObjective; labelKey: string }[] = [
  { value: "TRAFFIC", labelKey: "adsCreate.tiktok.objectiveTraffic" },
  { value: "PRODUCT_SALES", labelKey: "adsCreate.tiktok.objectiveSales" },
  { value: "REACH", labelKey: "adsCreate.tiktok.objectiveReach" },
  { value: "VIDEO_VIEWS", labelKey: "adsCreate.tiktok.objectiveVideoViews" },
  { value: "LEAD_GENERATION", labelKey: "adsCreate.tiktok.objectiveLeads" },
  { value: "APP_PROMOTION", labelKey: "adsCreate.tiktok.objectiveApp" },
];

const BUDGET_MODES: { value: TiktokBudgetMode; labelKey: string }[] = [
  { value: "BUDGET_MODE_DAY", labelKey: "adsCreate.budgetModeDaily" },
  { value: "BUDGET_MODE_TOTAL", labelKey: "adsCreate.budgetModeTotal" },
  { value: "BUDGET_MODE_INFINITE", labelKey: "adsCreate.budgetModeInfinite" },
];

const TIKTOK_CTAS = ["LEARN_MORE", "SHOP_NOW", "SIGN_UP", "DOWNLOAD", "ORDER_NOW", "CONTACT_US"];

const SPARK_IDENTITY_TYPES = new Set(["TT_USER", "AUTH_CODE", "BC_AUTH_TT"]);

type IdentityOption = {
  identityId: string;
  identityType: string;
  displayName: string;
};

type IdentityVideo = {
  itemId: string;
  title?: string;
};

interface Props {
  locationSearch: string;
  currencyCode?: string;
  onSuccess: (campaignId: string, adId: string) => void;
}

function suggestedMinBudget(currency: string): string {
  const code = currency.toUpperCase();
  if (code === "JPY") return "3000";
  if (code === "KRW") return "30000";
  if (code === "VND") return "500000";
  if (code === "IDR") return "300000";
  return "20";
}

export function TiktokAdsForm({ locationSearch, currencyCode = "", onSuccess }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<TiktokAdFormData>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [identities, setIdentities] = useState<IdentityOption[]>([]);
  const [identitiesLoading, setIdentitiesLoading] = useState(false);
  const [identitiesError, setIdentitiesError] = useState<string | null>(null);
  const [videos, setVideos] = useState<IdentityVideo[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);

  const currency = currencyCode.trim() || "USD";
  const minBudgetHint = suggestedMinBudget(currency);
  const isSparkIdentity = SPARK_IDENTITY_TYPES.has(form.identityType);

  function set<K extends keyof TiktokAdFormData>(key: K, value: TiktokAdFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    let cancelled = false;
    async function loadIdentities() {
      setIdentitiesLoading(true);
      setIdentitiesError(null);
      try {
        const resp = await fetch(`/api/ads-create/tiktok-identities${locationSearch}`);
        const json = (await resp.json()) as {
          ok: boolean;
          identities?: IdentityOption[];
          errorMsg?: string;
        };
        if (cancelled) return;
        if (!json.ok) {
          setIdentitiesError(json.errorMsg ?? t("adsCreate.tiktok.identityLoadFailed"));
          setIdentities([]);
          return;
        }
        setIdentities(json.identities ?? []);
      } catch (err) {
        if (!cancelled) {
          setIdentitiesError(
            err instanceof Error ? err.message : t("adsCreate.tiktok.identityLoadFailed"),
          );
        }
      } finally {
        if (!cancelled) setIdentitiesLoading(false);
      }
    }
    void loadIdentities();
    return () => {
      cancelled = true;
    };
  }, [locationSearch, t]);

  useEffect(() => {
    if (!form.identityId || !form.identityType || !isSparkIdentity) {
      setVideos([]);
      return;
    }
    let cancelled = false;
    async function loadVideos() {
      setVideosLoading(true);
      try {
        const qs = new URLSearchParams(locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch);
        qs.set("identityId", form.identityId);
        qs.set("identityType", form.identityType);
        const resp = await fetch(`/api/ads-create/tiktok-identities?${qs.toString()}`);
        const json = (await resp.json()) as {
          ok: boolean;
          videos?: IdentityVideo[];
        };
        if (!cancelled) setVideos(json.videos ?? []);
      } catch {
        if (!cancelled) setVideos([]);
      } finally {
        if (!cancelled) setVideosLoading(false);
      }
    }
    void loadVideos();
    return () => {
      cancelled = true;
    };
  }, [form.identityId, form.identityType, isSparkIdentity, locationSearch]);

  function selectIdentity(value: string) {
    const [identityId, identityType] = value.split("::");
    const found = identities.find(
      (i) => i.identityId === identityId && i.identityType === identityType,
    );
    setForm((prev) => ({
      ...prev,
      identityId: identityId || "",
      identityType: identityType || "",
      identityDisplayName: found?.displayName ?? "",
      tiktokItemId: "",
      creativeMode:
        identityType && SPARK_IDENTITY_TYPES.has(identityType)
          ? prev.creativeMode === "SINGLE_IMAGE"
            ? "SPARK_POST"
            : prev.creativeMode
          : prev.creativeMode === "SPARK_POST"
            ? "SINGLE_IMAGE"
            : prev.creativeMode,
    }));
  }

  async function uploadAsset(kind: "image" | "video", url: string): Promise<string> {
    const resp = await fetch(`/api/ads-create/tiktok-upload${locationSearch}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, url }),
    });
    const json = (await resp.json()) as { ok: boolean; assetId?: string; errorMsg?: string };
    if (!json.ok || !json.assetId) {
      throw new Error(json.errorMsg ?? t("adsCreate.tiktok.uploadFailed"));
    }
    return json.assetId;
  }

  async function prepareAssets(): Promise<Partial<TiktokAdFormData>> {
    const patch: Partial<TiktokAdFormData> = {};
    if (form.creativeMode === "SINGLE_IMAGE") {
      if (!form.adImageId && form.adImageUrl.trim()) {
        patch.adImageId = await uploadAsset("image", form.adImageUrl.trim());
      }
    } else if (form.creativeMode === "SINGLE_VIDEO") {
      if (!form.adVideoId && form.adVideoUrl.trim()) {
        patch.adVideoId = await uploadAsset("video", form.adVideoUrl.trim());
      }
      if (!form.adImageId && form.adImageUrl.trim()) {
        patch.adImageId = await uploadAsset("image", form.adImageUrl.trim());
      }
    }
    return patch;
  }

  function canSubmitStep3(): boolean {
    if (!form.adName || !form.adLandingUrl || !form.identityId) return false;
    if (form.creativeMode === "SPARK_POST") return Boolean(form.tiktokItemId);
    if (form.creativeMode === "SINGLE_VIDEO") {
      return Boolean(form.adVideoId || form.adVideoUrl.trim());
    }
    return Boolean(form.adImageId || form.adImageUrl.trim());
  }

  async function handleSubmit() {
    setSubmitting(true);
    setResult(null);
    try {
      setUploading(true);
      const assetPatch = await prepareAssets();
      setUploading(false);
      const payload: TiktokAdFormData = { ...form, ...assetPatch };
      if (assetPatch.adImageId) set("adImageId", assetPatch.adImageId);
      if (assetPatch.adVideoId) set("adVideoId", assetPatch.adVideoId);

      const resp = await fetch(`/api/ads-create${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "tiktok", mode: "create", tiktok: payload }),
      });
      const json = (await resp.json()) as {
        ok: boolean;
        campaignId?: string;
        adId?: string;
        errorMsg?: string;
      };
      if (json.ok) {
        setResult({ ok: true, msg: t("adsCreate.successMsg", { id: json.adId }) });
        onSuccess(json.campaignId ?? "", json.adId ?? "");
      } else {
        setResult({ ok: false, msg: json.errorMsg ?? t("adsCreate.errorFallback") });
      }
    } catch (err) {
      setResult({
        ok: false,
        msg: err instanceof Error ? err.message : t("adsCreate.errorFallback"),
      });
    } finally {
      setUploading(false);
      setSubmitting(false);
    }
  }

  const creativeModes: { value: TiktokCreativeMode; labelKey: string; disabled?: boolean }[] = [
    {
      value: "SINGLE_IMAGE",
      labelKey: "adsCreate.tiktok.creativeImage",
      disabled: isSparkIdentity,
    },
    { value: "SINGLE_VIDEO", labelKey: "adsCreate.tiktok.creativeVideo" },
    {
      value: "SPARK_POST",
      labelKey: "adsCreate.tiktok.creativeSpark",
      disabled: !isSparkIdentity,
    },
  ];

  return (
    <div style={s.formWrap}>
      <StepIndicator
        steps={[t("adsCreate.stepCampaign"), t("adsCreate.stepAdGroup"), t("adsCreate.stepAd")]}
        current={step}
      />

      {step === 1 && (
        <div style={s.card}>
          <h3 style={s.sectionTitle}>{t("adsCreate.stepCampaign")}</h3>

          <FormField label={t("adsCreate.fieldCampaignName")} required>
            <input
              style={s.input}
              value={form.campaignName}
              onChange={(e) => set("campaignName", e.target.value)}
              placeholder={t("adsCreate.fieldCampaignNamePlaceholder")}
            />
          </FormField>

          <FormField label={t("adsCreate.tiktok.fieldObjective")} required>
            <select
              style={s.select}
              value={form.campaignObjective}
              onChange={(e) => set("campaignObjective", e.target.value as TiktokObjective)}
            >
              {OBJECTIVES.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label={t("adsCreate.fieldBudgetMode")}>
            <select
              style={s.select}
              value={form.campaignBudgetMode}
              onChange={(e) => set("campaignBudgetMode", e.target.value as TiktokBudgetMode)}
            >
              {BUDGET_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {t(m.labelKey)}
                </option>
              ))}
            </select>
          </FormField>

          {form.campaignBudgetMode !== "BUDGET_MODE_INFINITE" && (
            <FormField
              label={t("adsCreate.fieldBudget")}
              hint={t("adsCreate.tiktok.fieldBudgetHint", {
                amount: minBudgetHint,
                currency,
              })}
            >
              <input
                style={s.input}
                type="number"
                min="0"
                step="0.01"
                value={form.campaignBudget}
                onChange={(e) => set("campaignBudget", e.target.value)}
                placeholder={minBudgetHint}
              />
            </FormField>
          )}

          <FormField label={t("adsCreate.fieldStatus")}>
            <div style={s.radioGroup}>
              {(["ENABLE", "DISABLE"] as const).map((v) => (
                <label key={v} style={s.radioLabel}>
                  <input
                    type="radio"
                    name="tiktokStatus"
                    value={v}
                    checked={form.campaignStatus === v}
                    onChange={() => set("campaignStatus", v)}
                  />
                  {t(v === "ENABLE" ? "adsCreate.statusActive" : "adsCreate.statusPaused")}
                </label>
              ))}
            </div>
          </FormField>

          <div style={s.btnRow}>
            <button
              type="button"
              style={s.btnPrimary}
              disabled={!form.campaignName}
              onClick={() => setStep(2)}
            >
              {t("adsCreate.nextStep")}
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={s.card}>
          <h3 style={s.sectionTitle}>{t("adsCreate.stepAdGroup")}</h3>

          <FormField label={t("adsCreate.tiktok.fieldAdGroupName")} required>
            <input
              style={s.input}
              value={form.adGroupName}
              onChange={(e) => set("adGroupName", e.target.value)}
              placeholder={t("adsCreate.tiktok.fieldAdGroupNamePlaceholder")}
            />
          </FormField>

          <FormField
            label={t("adsCreate.tiktok.fieldIdentity")}
            required
            hint={
              identitiesLoading
                ? t("adsCreate.tiktok.identityLoading")
                : identitiesError ||
                  (identities.length === 0 ? t("adsCreate.tiktok.identityEmpty") : undefined)
            }
          >
            <select
              style={s.select}
              value={
                form.identityId && form.identityType
                  ? `${form.identityId}::${form.identityType}`
                  : ""
              }
              onChange={(e) => selectIdentity(e.target.value)}
              disabled={identitiesLoading || identities.length === 0}
            >
              <option value="">{t("adsCreate.tiktok.identityPlaceholder")}</option>
              {identities.map((id) => (
                <option
                  key={`${id.identityId}:${id.identityType}`}
                  value={`${id.identityId}::${id.identityType}`}
                >
                  {id.displayName || id.identityId} ({id.identityType})
                </option>
              ))}
            </select>
          </FormField>

          <FormField label={t("adsCreate.fieldBudgetMode")}>
            <select
              style={s.select}
              value={form.adGroupBudgetMode}
              onChange={(e) => set("adGroupBudgetMode", e.target.value as TiktokBudgetMode)}
            >
              {BUDGET_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {t(m.labelKey)}
                </option>
              ))}
            </select>
          </FormField>

          {form.adGroupBudgetMode !== "BUDGET_MODE_INFINITE" && (
            <FormField
              label={t("adsCreate.fieldBudget")}
              hint={t("adsCreate.tiktok.fieldBudgetCurrencyHint", { currency })}
            >
              <input
                style={s.input}
                type="number"
                min="0"
                step="0.01"
                value={form.adGroupBudget}
                onChange={(e) => set("adGroupBudget", e.target.value)}
                placeholder={minBudgetHint}
              />
            </FormField>
          )}

          <div style={s.row}>
            <FormField
              label={t("adsCreate.tiktok.fieldStartTime")}
              hint={t("adsCreate.tiktok.fieldStartTimeHint")}
            >
              <input
                style={s.input}
                type="datetime-local"
                value={form.adGroupScheduleStart}
                onChange={(e) => set("adGroupScheduleStart", e.target.value)}
              />
            </FormField>
            <FormField
              label={t("adsCreate.tiktok.fieldEndTime")}
              hint={t("adsCreate.tiktok.fieldEndTimeHint")}
            >
              <input
                style={s.input}
                type="datetime-local"
                value={form.adGroupScheduleEnd}
                onChange={(e) => set("adGroupScheduleEnd", e.target.value)}
              />
            </FormField>
          </div>

          <FormField
            label={t("adsCreate.tiktok.fieldLocations")}
            hint={t("adsCreate.tiktok.fieldLocationsHint")}
          >
            <input
              style={s.input}
              value={form.locationIds}
              onChange={(e) => set("locationIds", e.target.value)}
              placeholder="6252001"
            />
          </FormField>

          <FormField label={t("adsCreate.fieldGender")}>
            <select
              style={s.select}
              value={form.gender}
              onChange={(e) => set("gender", e.target.value as TiktokAdFormData["gender"])}
            >
              <option value="GENDER_UNLIMITED">{t("adsCreate.genderAll")}</option>
              <option value="GENDER_MALE">{t("adsCreate.genderMale")}</option>
              <option value="GENDER_FEMALE">{t("adsCreate.genderFemale")}</option>
            </select>
          </FormField>

          <div style={s.btnRow}>
            <button type="button" style={s.btnSecondary} onClick={() => setStep(1)}>
              {t("adsCreate.prevStep")}
            </button>
            <button
              type="button"
              style={s.btnPrimary}
              disabled={!form.adGroupName || !form.identityId}
              onClick={() => setStep(3)}
            >
              {t("adsCreate.nextStep")}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={s.card}>
          <h3 style={s.sectionTitle}>{t("adsCreate.stepAd")}</h3>

          <FormField label={t("adsCreate.fieldAdName")} required>
            <input
              style={s.input}
              value={form.adName}
              onChange={(e) => set("adName", e.target.value)}
              placeholder={t("adsCreate.fieldAdNamePlaceholder")}
            />
          </FormField>

          <FormField label={t("adsCreate.tiktok.fieldCreativeMode")} required>
            <select
              style={s.select}
              value={form.creativeMode}
              onChange={(e) => set("creativeMode", e.target.value as TiktokCreativeMode)}
            >
              {creativeModes.map((m) => (
                <option key={m.value} value={m.value} disabled={m.disabled}>
                  {t(m.labelKey)}
                </option>
              ))}
            </select>
          </FormField>

          {form.creativeMode === "SINGLE_IMAGE" && (
            <FormField
              label={t("adsCreate.fieldImageUrl")}
              required
              hint={t("adsCreate.tiktok.fieldImageUrlHint")}
            >
              <input
                style={s.input}
                type="url"
                value={form.adImageUrl}
                onChange={(e) => {
                  set("adImageUrl", e.target.value);
                  set("adImageId", "");
                }}
                placeholder="https://"
              />
            </FormField>
          )}

          {form.creativeMode === "SINGLE_VIDEO" && (
            <>
              <FormField
                label={t("adsCreate.tiktok.fieldVideoUrl")}
                required
                hint={t("adsCreate.tiktok.fieldVideoUrlHint")}
              >
                <input
                  style={s.input}
                  type="url"
                  value={form.adVideoUrl}
                  onChange={(e) => {
                    set("adVideoUrl", e.target.value);
                    set("adVideoId", "");
                  }}
                  placeholder="https://"
                />
              </FormField>
              <FormField
                label={t("adsCreate.tiktok.fieldCoverImageUrl")}
                hint={t("adsCreate.tiktok.fieldCoverImageUrlHint")}
              >
                <input
                  style={s.input}
                  type="url"
                  value={form.adImageUrl}
                  onChange={(e) => {
                    set("adImageUrl", e.target.value);
                    set("adImageId", "");
                  }}
                  placeholder="https://"
                />
              </FormField>
            </>
          )}

          {form.creativeMode === "SPARK_POST" && (
            <FormField
              label={t("adsCreate.tiktok.fieldSparkPost")}
              required
              hint={
                videosLoading
                  ? t("adsCreate.tiktok.sparkLoading")
                  : videos.length === 0
                    ? t("adsCreate.tiktok.sparkEmpty")
                    : undefined
              }
            >
              <select
                style={s.select}
                value={form.tiktokItemId}
                onChange={(e) => set("tiktokItemId", e.target.value)}
                disabled={videosLoading || videos.length === 0}
              >
                <option value="">{t("adsCreate.tiktok.sparkPlaceholder")}</option>
                {videos.map((v) => (
                  <option key={v.itemId} value={v.itemId}>
                    {v.title ? `${v.title} (${v.itemId})` : v.itemId}
                  </option>
                ))}
              </select>
            </FormField>
          )}

          <FormField label={t("adsCreate.tiktok.fieldAdText")} hint={t("adsCreate.tiktok.fieldAdTextHint")}>
            <textarea
              style={s.textarea}
              rows={3}
              maxLength={100}
              value={form.adText}
              onChange={(e) => set("adText", e.target.value)}
            />
            <span style={s.charCount}>{form.adText.length}/100</span>
          </FormField>

          <FormField label={t("adsCreate.fieldCta")}>
            <select
              style={s.select}
              value={form.adCallToAction}
              onChange={(e) => set("adCallToAction", e.target.value)}
            >
              {TIKTOK_CTAS.map((cta) => (
                <option key={cta} value={cta}>
                  {cta.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label={t("adsCreate.fieldLinkUrl")} required>
            <input
              style={s.input}
              type="url"
              value={form.adLandingUrl}
              onChange={(e) => set("adLandingUrl", e.target.value)}
              placeholder="https://"
            />
          </FormField>

          {result && <SubmitResult ok={result.ok} msg={result.msg} />}

          <div style={s.btnRow}>
            <button type="button" style={s.btnSecondary} onClick={() => setStep(2)}>
              {t("adsCreate.prevStep")}
            </button>
            <button
              type="button"
              style={{
                ...s.btnPrimary,
                opacity: !canSubmitStep3() || submitting ? 0.6 : 1,
                cursor: submitting ? "wait" : "pointer",
              }}
              disabled={!canSubmitStep3() || submitting}
              onClick={() => void handleSubmit()}
            >
              {uploading
                ? t("adsCreate.tiktok.uploading")
                : submitting
                  ? t("adsCreate.submitting")
                  : t("adsCreate.submit")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
