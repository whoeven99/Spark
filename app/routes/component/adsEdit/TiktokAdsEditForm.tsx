import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formStyles as s, FormField, SubmitResult } from "../adsCreate/formShared";
import type { TiktokAdsEditDetail, TiktokEditFormData } from "./types";

interface Props {
  detail: TiktokAdsEditDetail;
  locationSearch: string;
  onSuccess: () => void;
}

function detailToForm(detail: TiktokAdsEditDetail): TiktokEditFormData {
  return {
    campaign: {
      name: detail.campaign.name,
      status: detail.campaign.status,
      budgetMode: detail.campaign.budgetMode,
      budget: detail.campaign.budget,
    },
    adGroup: {
      name: detail.adGroup.name,
      status: detail.adGroup.status,
      budgetMode: detail.adGroup.budgetMode,
      budget: detail.adGroup.budget,
      scheduleStart: detail.adGroup.scheduleStart,
      scheduleEnd: detail.adGroup.scheduleEnd,
      gender: detail.adGroup.gender,
    },
    ad: {
      name: detail.ad.name,
      status: detail.ad.status,
      adText: detail.ad.adText,
      callToAction: detail.ad.callToAction,
      imageUrl: detail.ad.imageUrl,
      landingUrl: detail.ad.landingUrl,
    },
  };
}

const BUDGET_MODES = [
  { value: "BUDGET_MODE_DAY", labelKey: "adsCreate.budgetModeDaily" },
  { value: "BUDGET_MODE_TOTAL", labelKey: "adsCreate.budgetModeTotal" },
  { value: "BUDGET_MODE_INFINITE", labelKey: "adsCreate.budgetModeInfinite" },
];

const TIKTOK_CTAS = [
  "LEARN_MORE", "SHOP_NOW", "SIGN_UP", "DOWNLOAD",
  "BOOK_NOW", "CONTACT_US", "ORDER_NOW", "WATCH_MORE",
];

export function TiktokAdsEditForm({ detail, locationSearch, onSuccess }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<TiktokEditFormData>(() => detailToForm(detail));
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function setC<K extends keyof TiktokEditFormData["campaign"]>(
    key: K, value: TiktokEditFormData["campaign"][K],
  ) { setForm((prev) => ({ ...prev, campaign: { ...prev.campaign, [key]: value } })); }

  function setG<K extends keyof TiktokEditFormData["adGroup"]>(
    key: K, value: TiktokEditFormData["adGroup"][K],
  ) { setForm((prev) => ({ ...prev, adGroup: { ...prev.adGroup, [key]: value } })); }

  function setA<K extends keyof TiktokEditFormData["ad"]>(
    key: K, value: TiktokEditFormData["ad"][K],
  ) { setForm((prev) => ({ ...prev, ad: { ...prev.ad, [key]: value } })); }

  async function handleSubmit() {
    setSubmitting(true);
    setResult(null);
    try {
      const resp = await fetch(`/api/ads-edit${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "tiktok",
          campaignId: detail.campaign.id,
          adGroupId: detail.adGroup.id,
          adId: detail.ad.id,
          tiktok: form,
        }),
      });
      const json = (await resp.json()) as { ok: boolean; errorMsg?: string };
      if (json.ok) {
        setResult({ ok: true, msg: t("adsEdit.successMsg") });
        onSuccess();
      } else {
        setResult({ ok: false, msg: json.errorMsg ?? t("adsEdit.errorFallback") });
      }
    } catch (err) {
      setResult({ ok: false, msg: err instanceof Error ? err.message : t("adsEdit.errorFallback") });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={s.formWrap}>
      {/* Campaign 层 */}
      <div style={s.card}>
        <h3 style={s.sectionTitle}>{t("adsCreate.stepCampaign")}</h3>
        <div style={s.row}>
          <FormField label={t("adsCreate.fieldCampaignName")} required>
            <input
              style={s.input}
              value={form.campaign.name}
              onChange={(e) => setC("name", e.target.value)}
            />
          </FormField>
          <FormField label={t("adsCreate.fieldStatus")}>
            <select style={s.select} value={form.campaign.status} onChange={(e) => setC("status", e.target.value as "ENABLE" | "DISABLE")}>
              <option value="ENABLE">{t("adsCreate.statusActive")}</option>
              <option value="DISABLE">{t("adsCreate.statusPaused")}</option>
            </select>
          </FormField>
        </div>
        <div style={s.row}>
          <FormField label={t("adsCreate.fieldBudgetMode")}>
            <select style={s.select} value={form.campaign.budgetMode} onChange={(e) => setC("budgetMode", e.target.value)}>
              {BUDGET_MODES.map((m) => (
                <option key={m.value} value={m.value}>{t(m.labelKey)}</option>
              ))}
            </select>
          </FormField>
          {form.campaign.budgetMode !== "BUDGET_MODE_INFINITE" && (
            <FormField label={t("adsCreate.fieldBudget")} hint={t("adsCreate.tiktok.fieldBudgetHint")}>
              <input
                style={s.input}
                type="number"
                min="0"
                step="0.01"
                value={form.campaign.budget}
                onChange={(e) => setC("budget", e.target.value)}
              />
            </FormField>
          )}
        </div>
      </div>

      {/* Ad Group 层 */}
      <div style={s.card}>
        <h3 style={s.sectionTitle}>{t("adsCreate.stepAdGroup")}</h3>
        <div style={s.row}>
          <FormField label={t("adsCreate.tiktok.fieldAdGroupName")} required>
            <input
              style={s.input}
              value={form.adGroup.name}
              onChange={(e) => setG("name", e.target.value)}
            />
          </FormField>
          <FormField label={t("adsCreate.fieldStatus")}>
            <select style={s.select} value={form.adGroup.status} onChange={(e) => setG("status", e.target.value as "ENABLE" | "DISABLE")}>
              <option value="ENABLE">{t("adsCreate.statusActive")}</option>
              <option value="DISABLE">{t("adsCreate.statusPaused")}</option>
            </select>
          </FormField>
        </div>
        <div style={s.row}>
          <FormField label={t("adsCreate.fieldBudgetMode")}>
            <select style={s.select} value={form.adGroup.budgetMode} onChange={(e) => setG("budgetMode", e.target.value)}>
              {BUDGET_MODES.map((m) => (
                <option key={m.value} value={m.value}>{t(m.labelKey)}</option>
              ))}
            </select>
          </FormField>
          {form.adGroup.budgetMode !== "BUDGET_MODE_INFINITE" && (
            <FormField label={t("adsCreate.fieldBudget")}>
              <input
                style={s.input}
                type="number"
                min="0"
                step="0.01"
                value={form.adGroup.budget}
                onChange={(e) => setG("budget", e.target.value)}
              />
            </FormField>
          )}
        </div>
        <div style={s.row}>
          <FormField label={t("adsCreate.meta.fieldStartTime")}>
            <input
              style={s.input}
              type="datetime-local"
              value={form.adGroup.scheduleStart?.slice(0, 16) ?? ""}
              onChange={(e) => setG("scheduleStart", e.target.value)}
            />
          </FormField>
          <FormField label={t("adsCreate.meta.fieldEndTime")}>
            <input
              style={s.input}
              type="datetime-local"
              value={form.adGroup.scheduleEnd?.slice(0, 16) ?? ""}
              onChange={(e) => setG("scheduleEnd", e.target.value)}
            />
          </FormField>
          <FormField label={t("adsCreate.fieldGender")}>
            <select style={s.select} value={form.adGroup.gender} onChange={(e) => setG("gender", e.target.value as TiktokEditFormData["adGroup"]["gender"])}>
              <option value="GENDER_UNLIMITED">{t("adsCreate.genderAll")}</option>
              <option value="GENDER_MALE">{t("adsCreate.genderMale")}</option>
              <option value="GENDER_FEMALE">{t("adsCreate.genderFemale")}</option>
            </select>
          </FormField>
        </div>
      </div>

      {/* Ad 层 */}
      <div style={s.card}>
        <h3 style={s.sectionTitle}>{t("adsCreate.stepAd")}</h3>
        <div style={s.row}>
          <FormField label={t("adsCreate.fieldAdName")} required>
            <input
              style={s.input}
              value={form.ad.name}
              onChange={(e) => setA("name", e.target.value)}
            />
          </FormField>
          <FormField label={t("adsCreate.fieldStatus")}>
            <select style={s.select} value={form.ad.status} onChange={(e) => setA("status", e.target.value as "ENABLE" | "DISABLE")}>
              <option value="ENABLE">{t("adsCreate.statusActive")}</option>
              <option value="DISABLE">{t("adsCreate.statusPaused")}</option>
            </select>
          </FormField>
        </div>
        <FormField label={t("adsCreate.tiktok.fieldAdText")} hint={t("adsCreate.tiktok.fieldAdTextHint")}>
          <textarea
            style={{ ...s.textarea, minHeight: 80 }}
            maxLength={100}
            value={form.ad.adText}
            onChange={(e) => setA("adText", e.target.value)}
          />
          <span style={s.charCount}>{form.ad.adText.length}/100</span>
        </FormField>
        <div style={s.row}>
          <FormField label={t("adsCreate.fieldCta")}>
            <select style={s.select} value={form.ad.callToAction} onChange={(e) => setA("callToAction", e.target.value)}>
              {TIKTOK_CTAS.map((cta) => (
                <option key={cta} value={cta}>{cta.replace(/_/g, " ")}</option>
              ))}
            </select>
          </FormField>
          <FormField label={t("adsCreate.fieldLinkUrl")}>
            <input
              style={s.input}
              value={form.ad.landingUrl}
              onChange={(e) => setA("landingUrl", e.target.value)}
            />
          </FormField>
        </div>
      </div>

      {result && <SubmitResult ok={result.ok} msg={result.msg} />}

      <div style={s.btnRow}>
        <button
          style={{ ...s.btnPrimary, opacity: submitting ? 0.7 : 1 }}
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? t("adsEdit.saving") : t("adsEdit.save")}
        </button>
      </div>
    </div>
  );
}
