import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TiktokAdFormData, TiktokObjective, TiktokBudgetMode } from "./types";
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
  adName: "",
  adText: "",
  adCallToAction: "LEARN_MORE",
  adImageUrl: "",
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

interface Props {
  locationSearch: string;
  onSuccess: (campaignId: string, adId: string) => void;
}

export function TiktokAdsForm({ locationSearch, onSuccess }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<TiktokAdFormData>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function set<K extends keyof TiktokAdFormData>(key: K, value: TiktokAdFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setResult(null);
    try {
      const resp = await fetch(`/api/ads-create${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "tiktok", mode: "create", tiktok: form }),
      });
      const json = (await resp.json()) as { ok: boolean; campaignId?: string; adId?: string; errorMsg?: string };
      if (json.ok) {
        setResult({ ok: true, msg: t("adsCreate.successMsg", { id: json.adId }) });
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
        steps={[t("adsCreate.stepCampaign"), t("adsCreate.stepAdGroup"), t("adsCreate.stepAd")]}
        current={step}
      />

      {step === 1 && (
        <div style={s.card}>
          <h3 style={s.sectionTitle}>{t("adsCreate.stepCampaign")}</h3>

          <FormField label={t("adsCreate.fieldCampaignName")} required>
            <input style={s.input} value={form.campaignName} onChange={(e) => set("campaignName", e.target.value)} placeholder={t("adsCreate.fieldCampaignNamePlaceholder")} />
          </FormField>

          <FormField label={t("adsCreate.tiktok.fieldObjective")} required>
            <select style={s.select} value={form.campaignObjective} onChange={(e) => set("campaignObjective", e.target.value as TiktokObjective)}>
              {OBJECTIVES.map((o) => (
                <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
              ))}
            </select>
          </FormField>

          <FormField label={t("adsCreate.fieldBudgetMode")}>
            <select style={s.select} value={form.campaignBudgetMode} onChange={(e) => set("campaignBudgetMode", e.target.value as TiktokBudgetMode)}>
              {BUDGET_MODES.map((m) => (
                <option key={m.value} value={m.value}>{t(m.labelKey)}</option>
              ))}
            </select>
          </FormField>

          {form.campaignBudgetMode !== "BUDGET_MODE_INFINITE" && (
            <FormField label={t("adsCreate.fieldBudget")} hint={t("adsCreate.tiktok.fieldBudgetHint")}>
              <input style={s.input} type="number" min="0" step="0.01" value={form.campaignBudget} onChange={(e) => set("campaignBudget", e.target.value)} placeholder="20.00" />
            </FormField>
          )}

          <FormField label={t("adsCreate.fieldStatus")}>
            <div style={s.radioGroup}>
              {(["ENABLE", "DISABLE"] as const).map((v) => (
                <label key={v} style={s.radioLabel}>
                  <input type="radio" name="tiktokStatus" value={v} checked={form.campaignStatus === v} onChange={() => set("campaignStatus", v)} />
                  {t(v === "ENABLE" ? "adsCreate.statusActive" : "adsCreate.statusPaused")}
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
          <h3 style={s.sectionTitle}>{t("adsCreate.stepAdGroup")}</h3>

          <FormField label={t("adsCreate.tiktok.fieldAdGroupName")} required>
            <input style={s.input} value={form.adGroupName} onChange={(e) => set("adGroupName", e.target.value)} placeholder={t("adsCreate.tiktok.fieldAdGroupNamePlaceholder")} />
          </FormField>

          <FormField label={t("adsCreate.fieldBudgetMode")}>
            <select style={s.select} value={form.adGroupBudgetMode} onChange={(e) => set("adGroupBudgetMode", e.target.value as TiktokBudgetMode)}>
              {BUDGET_MODES.map((m) => (
                <option key={m.value} value={m.value}>{t(m.labelKey)}</option>
              ))}
            </select>
          </FormField>

          {form.adGroupBudgetMode !== "BUDGET_MODE_INFINITE" && (
            <FormField label={t("adsCreate.fieldBudget")}>
              <input style={s.input} type="number" min="0" step="0.01" value={form.adGroupBudget} onChange={(e) => set("adGroupBudget", e.target.value)} placeholder="10.00" />
            </FormField>
          )}

          <div style={s.row}>
            <FormField label={t("adsCreate.meta.fieldStartTime")}>
              <input style={s.input} type="datetime-local" value={form.adGroupScheduleStart} onChange={(e) => set("adGroupScheduleStart", e.target.value)} />
            </FormField>
            <FormField label={t("adsCreate.meta.fieldEndTime")}>
              <input style={s.input} type="datetime-local" value={form.adGroupScheduleEnd} onChange={(e) => set("adGroupScheduleEnd", e.target.value)} />
            </FormField>
          </div>

          <FormField label={t("adsCreate.fieldGender")}>
            <select style={s.select} value={form.gender} onChange={(e) => set("gender", e.target.value as TiktokAdFormData["gender"])}>
              <option value="GENDER_UNLIMITED">{t("adsCreate.genderAll")}</option>
              <option value="GENDER_MALE">{t("adsCreate.genderMale")}</option>
              <option value="GENDER_FEMALE">{t("adsCreate.genderFemale")}</option>
            </select>
          </FormField>

          <div style={s.btnRow}>
            <button type="button" style={s.btnSecondary} onClick={() => setStep(1)}>{t("adsCreate.prevStep")}</button>
            <button type="button" style={s.btnPrimary} disabled={!form.adGroupName} onClick={() => setStep(3)}>
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

          <FormField label={t("adsCreate.tiktok.fieldAdText")} hint={t("adsCreate.tiktok.fieldAdTextHint")}>
            <textarea style={s.textarea} rows={3} maxLength={100} value={form.adText} onChange={(e) => set("adText", e.target.value)} />
            <span style={s.charCount}>{form.adText.length}/100</span>
          </FormField>

          <FormField label={t("adsCreate.fieldCta")}>
            <select style={s.select} value={form.adCallToAction} onChange={(e) => set("adCallToAction", e.target.value)}>
              {TIKTOK_CTAS.map((cta) => (
                <option key={cta} value={cta}>{cta.replace(/_/g, " ")}</option>
              ))}
            </select>
          </FormField>

          <FormField label={t("adsCreate.fieldImageUrl")} hint={t("adsCreate.fieldImageUrlHint")}>
            <input style={s.input} type="url" value={form.adImageUrl} onChange={(e) => set("adImageUrl", e.target.value)} placeholder="https://" />
          </FormField>

          <FormField label={t("adsCreate.fieldLinkUrl")} required>
            <input style={s.input} type="url" value={form.adLandingUrl} onChange={(e) => set("adLandingUrl", e.target.value)} placeholder="https://" />
          </FormField>

          {result && <SubmitResult ok={result.ok} msg={result.msg} />}

          <div style={s.btnRow}>
            <button type="button" style={s.btnSecondary} onClick={() => setStep(2)}>{t("adsCreate.prevStep")}</button>
            <button
              type="button"
              style={{ ...s.btnPrimary, opacity: (!form.adName || !form.adLandingUrl || submitting) ? 0.6 : 1, cursor: submitting ? "wait" : "pointer" }}
              disabled={!form.adName || !form.adLandingUrl || submitting}
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
