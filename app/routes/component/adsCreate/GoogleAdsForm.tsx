import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { GoogleAdFormData } from "./types";
import { formStyles as s, StepIndicator, FormField, SubmitResult } from "./formShared";
import { pageColorTokens } from "../../page/pageUiStyles";

const DEFAULT_FORM: GoogleAdFormData = {
  campaignName: "",
  campaignStatus: "PAUSED",
  campaignDailyBudget: "",
  adGroupName: "",
  adGroupStatus: "ENABLED",
  adGroupCpcBid: "",
  adFinalUrl: "",
  adHeadlines: ["", "", ""],
  adDescriptions: ["", ""],
};

const MIN_HEADLINES = 3;
const MAX_HEADLINES = 15;
const MIN_DESCRIPTIONS = 2;
const MAX_DESCRIPTIONS = 4;

interface Props {
  locationSearch: string;
  onSuccess: (campaignId: string, adId: string) => void;
}

export function GoogleAdsForm({ locationSearch, onSuccess }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<GoogleAdFormData>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function set<K extends keyof GoogleAdFormData>(key: K, value: GoogleAdFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setHeadline(index: number, value: string) {
    const updated = [...form.adHeadlines];
    updated[index] = value;
    set("adHeadlines", updated);
  }

  function setDescription(index: number, value: string) {
    const updated = [...form.adDescriptions];
    updated[index] = value;
    set("adDescriptions", updated);
  }

  function addHeadline() {
    if (form.adHeadlines.length < MAX_HEADLINES) {
      set("adHeadlines", [...form.adHeadlines, ""]);
    }
  }

  function removeHeadline(index: number) {
    if (form.adHeadlines.length > MIN_HEADLINES) {
      set("adHeadlines", form.adHeadlines.filter((_, i) => i !== index));
    }
  }

  function addDescription() {
    if (form.adDescriptions.length < MAX_DESCRIPTIONS) {
      set("adDescriptions", [...form.adDescriptions, ""]);
    }
  }

  function removeDescription(index: number) {
    if (form.adDescriptions.length > MIN_DESCRIPTIONS) {
      set("adDescriptions", form.adDescriptions.filter((_, i) => i !== index));
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setResult(null);
    try {
      const resp = await fetch(`/api/ads-create${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "google", mode: "create", google: form }),
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

  const headlinesValid = form.adHeadlines.filter((h) => h.trim()).length >= MIN_HEADLINES;
  const descriptionsValid = form.adDescriptions.filter((d) => d.trim()).length >= MIN_DESCRIPTIONS;
  const step3Valid = form.adFinalUrl && headlinesValid && descriptionsValid;

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

          <FormField label={t("adsCreate.google.fieldDailyBudget")} hint={t("adsCreate.google.fieldDailyBudgetHint")} required>
            <input style={s.input} type="number" min="0" step="0.01" value={form.campaignDailyBudget} onChange={(e) => set("campaignDailyBudget", e.target.value)} placeholder="10.00" />
          </FormField>

          <FormField label={t("adsCreate.fieldStatus")}>
            <div style={s.radioGroup}>
              {(["ENABLED", "PAUSED"] as const).map((v) => (
                <label key={v} style={s.radioLabel}>
                  <input type="radio" name="googleStatus" value={v} checked={form.campaignStatus === v} onChange={() => set("campaignStatus", v)} />
                  {t(v === "ENABLED" ? "adsCreate.statusActive" : "adsCreate.statusPaused")}
                </label>
              ))}
            </div>
          </FormField>

          <div style={s.btnRow}>
            <button type="button" style={s.btnPrimary} disabled={!form.campaignName || !form.campaignDailyBudget} onClick={() => setStep(2)}>
              {t("adsCreate.nextStep")}
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={s.card}>
          <h3 style={s.sectionTitle}>{t("adsCreate.stepAdGroup")}</h3>

          <FormField label={t("adsCreate.google.fieldAdGroupName")} required>
            <input style={s.input} value={form.adGroupName} onChange={(e) => set("adGroupName", e.target.value)} placeholder={t("adsCreate.google.fieldAdGroupNamePlaceholder")} />
          </FormField>

          <FormField label={t("adsCreate.google.fieldCpcBid")} hint={t("adsCreate.google.fieldCpcBidHint")} required>
            <input style={s.input} type="number" min="0" step="0.01" value={form.adGroupCpcBid} onChange={(e) => set("adGroupCpcBid", e.target.value)} placeholder="1.00" />
          </FormField>

          <FormField label={t("adsCreate.fieldStatus")}>
            <div style={s.radioGroup}>
              {(["ENABLED", "PAUSED"] as const).map((v) => (
                <label key={v} style={s.radioLabel}>
                  <input type="radio" name="googleAdGroupStatus" value={v} checked={form.adGroupStatus === v} onChange={() => set("adGroupStatus", v)} />
                  {t(v === "ENABLED" ? "adsCreate.statusActive" : "adsCreate.statusPaused")}
                </label>
              ))}
            </div>
          </FormField>

          <div style={s.btnRow}>
            <button type="button" style={s.btnSecondary} onClick={() => setStep(1)}>{t("adsCreate.prevStep")}</button>
            <button type="button" style={s.btnPrimary} disabled={!form.adGroupName || !form.adGroupCpcBid} onClick={() => setStep(3)}>
              {t("adsCreate.nextStep")}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={s.card}>
          <h3 style={s.sectionTitle}>{t("adsCreate.google.stepRsa")}</h3>

          <FormField label={t("adsCreate.google.fieldFinalUrl")} required>
            <input style={s.input} type="url" value={form.adFinalUrl} onChange={(e) => set("adFinalUrl", e.target.value)} placeholder="https://yourstore.com/page" />
          </FormField>

          <div>
            <label style={s.label}>
              {t("adsCreate.google.fieldHeadlines")}
              <span style={{ color: "#c0392b", marginLeft: 3 }}>*</span>
              <span style={{ fontWeight: 400, color: pageColorTokens.textSecondary, marginLeft: 6 }}>
                {t("adsCreate.google.fieldHeadlinesHint", { min: MIN_HEADLINES, max: MAX_HEADLINES })}
              </span>
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
              {form.adHeadlines.map((h, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    style={{ ...s.input, flex: 1 }}
                    maxLength={30}
                    value={h}
                    onChange={(e) => setHeadline(i, e.target.value)}
                    placeholder={t("adsCreate.google.headlinePlaceholder", { n: i + 1 })}
                  />
                  <span style={{ fontSize: 11, color: pageColorTokens.textSecondary, flexShrink: 0 }}>{h.length}/30</span>
                  {form.adHeadlines.length > MIN_HEADLINES && (
                    <button type="button" onClick={() => removeHeadline(i)} style={{ background: "none", border: "none", color: "#c0392b", cursor: "pointer", fontSize: 16 }}>×</button>
                  )}
                </div>
              ))}
            </div>
            {form.adHeadlines.length < MAX_HEADLINES && (
              <button type="button" onClick={addHeadline} style={{ ...s.btnSecondary, marginTop: 8, padding: "6px 12px", fontSize: 12 }}>
                + {t("adsCreate.google.addHeadline")}
              </button>
            )}
          </div>

          <div>
            <label style={s.label}>
              {t("adsCreate.google.fieldDescriptions")}
              <span style={{ color: "#c0392b", marginLeft: 3 }}>*</span>
              <span style={{ fontWeight: 400, color: pageColorTokens.textSecondary, marginLeft: 6 }}>
                {t("adsCreate.google.fieldDescriptionsHint", { min: MIN_DESCRIPTIONS, max: MAX_DESCRIPTIONS })}
              </span>
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
              {form.adDescriptions.map((d, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    style={{ ...s.input, flex: 1 }}
                    maxLength={90}
                    value={d}
                    onChange={(e) => setDescription(i, e.target.value)}
                    placeholder={t("adsCreate.google.descriptionPlaceholder", { n: i + 1 })}
                  />
                  <span style={{ fontSize: 11, color: pageColorTokens.textSecondary, flexShrink: 0 }}>{d.length}/90</span>
                  {form.adDescriptions.length > MIN_DESCRIPTIONS && (
                    <button type="button" onClick={() => removeDescription(i)} style={{ background: "none", border: "none", color: "#c0392b", cursor: "pointer", fontSize: 16 }}>×</button>
                  )}
                </div>
              ))}
            </div>
            {form.adDescriptions.length < MAX_DESCRIPTIONS && (
              <button type="button" onClick={addDescription} style={{ ...s.btnSecondary, marginTop: 8, padding: "6px 12px", fontSize: 12 }}>
                + {t("adsCreate.google.addDescription")}
              </button>
            )}
          </div>

          {result && <SubmitResult ok={result.ok} msg={result.msg} />}

          <div style={s.btnRow}>
            <button type="button" style={s.btnSecondary} onClick={() => setStep(2)}>{t("adsCreate.prevStep")}</button>
            <button
              type="button"
              style={{ ...s.btnPrimary, opacity: (!step3Valid || submitting) ? 0.6 : 1, cursor: submitting ? "wait" : "pointer" }}
              disabled={!step3Valid || submitting}
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
