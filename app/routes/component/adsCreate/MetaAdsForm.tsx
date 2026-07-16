import { useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import type { MetaAdFormData, MetaCampaignObjective, MetaCallToAction } from "./types";
import { formStyles as s, StepIndicator, FormField, SubmitResult } from "./formShared";

const DEFAULT_FORM: MetaAdFormData = {
  campaignName: "",
  campaignObjective: "OUTCOME_TRAFFIC",
  campaignDailyBudget: "",
  campaignStatus: "ACTIVE",
  adSetName: "",
  adSetStartTime: "",
  adSetEndTime: "",
  ageMin: "18",
  ageMax: "65",
  gender: "ALL",
  geoCountries: "US",
  adName: "",
  adHeadline: "",
  adBody: "",
  adCallToAction: "LEARN_MORE",
  adImageUrl: "",
  adLinkUrl: "",
};

const OBJECTIVES: { value: MetaCampaignObjective; labelKey: string }[] = [
  { value: "OUTCOME_TRAFFIC", labelKey: "adsCreate.meta.objectiveTraffic" },
  { value: "OUTCOME_SALES", labelKey: "adsCreate.meta.objectiveSales" },
  { value: "OUTCOME_AWARENESS", labelKey: "adsCreate.meta.objectiveAwareness" },
  { value: "OUTCOME_ENGAGEMENT", labelKey: "adsCreate.meta.objectiveEngagement" },
  { value: "OUTCOME_LEADS", labelKey: "adsCreate.meta.objectiveLeads" },
  { value: "OUTCOME_APP_PROMOTION", labelKey: "adsCreate.meta.objectiveApp" },
];

const CTAS: { value: MetaCallToAction; labelKey: string }[] = [
  { value: "LEARN_MORE", labelKey: "adsCreate.cta.learnMore" },
  { value: "SHOP_NOW", labelKey: "adsCreate.cta.shopNow" },
  { value: "SIGN_UP", labelKey: "adsCreate.cta.signUp" },
  { value: "DOWNLOAD", labelKey: "adsCreate.cta.download" },
  { value: "BOOK_NOW", labelKey: "adsCreate.cta.bookNow" },
  { value: "CONTACT_US", labelKey: "adsCreate.cta.contactUs" },
  { value: "ORDER_NOW", labelKey: "adsCreate.cta.orderNow" },
];

interface Props {
  locationSearch: string;
  onSuccess: (campaignId: string, adId: string) => void;
}

export function MetaAdsForm({ locationSearch, onSuccess }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<MetaAdFormData>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string; campaignId?: string; adId?: string } | null>(null);

  function set<K extends keyof MetaAdFormData>(key: K, value: MetaAdFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setResult(null);
    try {
      const resp = await fetch(`/api/ads-create${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "meta", mode: "create", meta: form }),
      });
      const json = (await resp.json()) as { ok: boolean; campaignId?: string; adId?: string; errorMsg?: string };
      if (json.ok) {
        setResult({ ok: true, msg: t("adsCreate.successMsg", { id: json.adId }), campaignId: json.campaignId, adId: json.adId });
        onSuccess(json.campaignId ?? "", json.adId ?? "");
      } else {
        setResult({ ok: false, msg: json.errorMsg ?? t("adsCreate.errorFallback") });
      }
    } catch (err) {
      setResult({ ok: false, msg: err instanceof Error ? err.message : t("adsCreate.errorFallback") });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={s.formWrap}>
      <StepIndicator
        steps={[t("adsCreate.stepCampaign"), t("adsCreate.stepAdSet"), t("adsCreate.stepAd")]}
        current={step}
      />

      {step === 1 && (
        <div style={s.card}>
          <h3 style={s.sectionTitle}>{t("adsCreate.stepCampaign")}</h3>

          <FormField label={t("adsCreate.fieldCampaignName")} required>
            <input style={s.input} value={form.campaignName} onChange={(e) => set("campaignName", e.target.value)} placeholder={t("adsCreate.fieldCampaignNamePlaceholder")} />
          </FormField>

          <FormField label={t("adsCreate.meta.fieldObjective")} required>
            <select style={s.select} value={form.campaignObjective} onChange={(e) => set("campaignObjective", e.target.value as MetaCampaignObjective)}>
              {OBJECTIVES.map((o) => (
                <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
              ))}
            </select>
          </FormField>

          <FormField label={t("adsCreate.meta.fieldDailyBudget")} hint={t("adsCreate.meta.fieldDailyBudgetHint")}>
            <input style={s.input} type="number" min="0" step="0.01" value={form.campaignDailyBudget} onChange={(e) => set("campaignDailyBudget", e.target.value)} placeholder="10.00" />
          </FormField>

          <FormField label={t("adsCreate.fieldStatus")}>
            <div style={s.radioGroup}>
              {(["ACTIVE", "PAUSED"] as const).map((v) => (
                <label key={v} style={s.radioLabel}>
                  <input type="radio" name="metaStatus" value={v} checked={form.campaignStatus === v} onChange={() => set("campaignStatus", v)} />
                  {t(v === "ACTIVE" ? "adsCreate.statusActive" : "adsCreate.statusPaused")}
                </label>
              ))}
            </div>
          </FormField>

          <div style={s.btnRow}>
            <button type="button" style={s.btnPrimary} disabled={!form.campaignName} onClick={() => setStep(2)}>
              {t("adsCreate.nextStep")}
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={s.card}>
          <h3 style={s.sectionTitle}>{t("adsCreate.stepAdSet")}</h3>

          <FormField label={t("adsCreate.meta.fieldAdSetName")} required>
            <input style={s.input} value={form.adSetName} onChange={(e) => set("adSetName", e.target.value)} placeholder={t("adsCreate.meta.fieldAdSetNamePlaceholder")} />
          </FormField>

          <div style={s.row}>
            <FormField label={t("adsCreate.meta.fieldStartTime")}>
              <input style={s.input} type="datetime-local" value={form.adSetStartTime} onChange={(e) => set("adSetStartTime", e.target.value)} />
            </FormField>
            <FormField label={t("adsCreate.meta.fieldEndTime")}>
              <input style={s.input} type="datetime-local" value={form.adSetEndTime} onChange={(e) => set("adSetEndTime", e.target.value)} />
            </FormField>
          </div>

          <div style={s.row}>
            <FormField label={t("adsCreate.meta.fieldAgeMin")}>
              <input style={s.input} type="number" min="18" max="65" value={form.ageMin} onChange={(e) => set("ageMin", e.target.value)} />
            </FormField>
            <FormField label={t("adsCreate.meta.fieldAgeMax")}>
              <input style={s.input} type="number" min="18" max="65" value={form.ageMax} onChange={(e) => set("ageMax", e.target.value)} />
            </FormField>
          </div>

          <FormField label={t("adsCreate.fieldGender")}>
            <select style={s.select} value={form.gender} onChange={(e) => set("gender", e.target.value as MetaAdFormData["gender"])}>
              <option value="ALL">{t("adsCreate.genderAll")}</option>
              <option value="MALE">{t("adsCreate.genderMale")}</option>
              <option value="FEMALE">{t("adsCreate.genderFemale")}</option>
            </select>
          </FormField>

          <FormField label={t("adsCreate.meta.fieldCountries")} hint={t("adsCreate.meta.fieldCountriesHint")}>
            <input style={s.input} value={form.geoCountries} onChange={(e) => set("geoCountries", e.target.value)} placeholder="US, CA, GB" />
          </FormField>

          <div style={s.btnRow}>
            <button type="button" style={s.btnSecondary} onClick={() => setStep(1)}>{t("adsCreate.prevStep")}</button>
            <button type="button" style={s.btnPrimary} disabled={!form.adSetName} onClick={() => setStep(3)}>
              {t("adsCreate.nextStep")}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={s.card}>
          <h3 style={s.sectionTitle}>{t("adsCreate.stepAd")}</h3>

          <FormField label={t("adsCreate.fieldAdName")} required>
            <input style={s.input} value={form.adName} onChange={(e) => set("adName", e.target.value)} placeholder={t("adsCreate.fieldAdNamePlaceholder")} />
          </FormField>

          <FormField label={t("adsCreate.meta.fieldHeadline")} hint={t("adsCreate.meta.fieldHeadlineHint")}>
            <input style={s.input} maxLength={40} value={form.adHeadline} onChange={(e) => set("adHeadline", e.target.value)} />
            <span style={s.charCount}>{form.adHeadline.length}/40</span>
          </FormField>

          <FormField label={t("adsCreate.meta.fieldBody")}>
            <textarea style={s.textarea} rows={3} value={form.adBody} onChange={(e) => set("adBody", e.target.value)} />
          </FormField>

          <FormField label={t("adsCreate.fieldCta")}>
            <select style={s.select} value={form.adCallToAction} onChange={(e) => set("adCallToAction", e.target.value as MetaCallToAction)}>
              {CTAS.map((c) => (
                <option key={c.value} value={c.value}>{t(c.labelKey)}</option>
              ))}
            </select>
          </FormField>

          <FormField label={t("adsCreate.fieldImageUrl")} hint={t("adsCreate.fieldImageUrlHint")}>
            <input style={s.input} type="url" value={form.adImageUrl} onChange={(e) => set("adImageUrl", e.target.value)} placeholder="https://" />
          </FormField>

          <FormField label={t("adsCreate.fieldLinkUrl")} required>
            <input style={s.input} type="url" value={form.adLinkUrl} onChange={(e) => set("adLinkUrl", e.target.value)} placeholder="https://" />
          </FormField>

          {result && <SubmitResult ok={result.ok} msg={result.msg} />}

          <div style={s.btnRow}>
            <button type="button" style={s.btnSecondary} onClick={() => setStep(2)}>{t("adsCreate.prevStep")}</button>
            <button
              type="button"
              style={{ ...s.btnPrimary, opacity: (!form.adName || !form.adLinkUrl || submitting) ? 0.6 : 1, cursor: submitting ? "wait" : "pointer" }}
              disabled={!form.adName || !form.adLinkUrl || submitting}
              onClick={() => void handleSubmit()}
            >
              {submitting ? t("adsCreate.submitting") : t("adsCreate.submit")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
