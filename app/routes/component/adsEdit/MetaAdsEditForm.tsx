import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formStyles as s, FormField, SubmitResult } from "../adsCreate/formShared";
import type { MetaAdsEditDetail, MetaEditFormData } from "./types";

interface Props {
  detail: MetaAdsEditDetail;
  locationSearch: string;
  onSuccess: () => void;
}

function detailToForm(detail: MetaAdsEditDetail): MetaEditFormData {
  return {
    campaign: {
      name: detail.campaign.name,
      status: detail.campaign.status,
      dailyBudget: detail.campaign.dailyBudget,
    },
    adSet: {
      name: detail.adSet.name,
      status: detail.adSet.status,
      startTime: detail.adSet.startTime,
      endTime: detail.adSet.endTime,
      ageMin: detail.adSet.ageMin,
      ageMax: detail.adSet.ageMax,
      gender: detail.adSet.gender,
      geoCountries: detail.adSet.geoCountries,
    },
    ad: {
      name: detail.ad.name,
      status: detail.ad.status,
      headline: detail.ad.headline,
      body: detail.ad.body,
      callToAction: detail.ad.callToAction,
      imageUrl: detail.ad.imageUrl,
      linkUrl: detail.ad.linkUrl,
    },
  };
}

const CTA_OPTIONS = [
  "LEARN_MORE", "SHOP_NOW", "SIGN_UP", "DOWNLOAD",
  "BOOK_NOW", "CONTACT_US", "ORDER_NOW",
];

export function MetaAdsEditForm({ detail, locationSearch, onSuccess }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<MetaEditFormData>(() => detailToForm(detail));
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function setC<K extends keyof MetaEditFormData["campaign"]>(
    key: K, value: MetaEditFormData["campaign"][K],
  ) { setForm((prev) => ({ ...prev, campaign: { ...prev.campaign, [key]: value } })); }

  function setAS<K extends keyof MetaEditFormData["adSet"]>(
    key: K, value: MetaEditFormData["adSet"][K],
  ) { setForm((prev) => ({ ...prev, adSet: { ...prev.adSet, [key]: value } })); }

  function setA<K extends keyof MetaEditFormData["ad"]>(
    key: K, value: MetaEditFormData["ad"][K],
  ) { setForm((prev) => ({ ...prev, ad: { ...prev.ad, [key]: value } })); }

  async function handleSubmit() {
    setSubmitting(true);
    setResult(null);
    try {
      const resp = await fetch(`/api/ads-edit${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "meta",
          campaignId: detail.campaign.id,
          adSetId: detail.adSet.id,
          adId: detail.ad.id,
          meta: form,
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
            <select style={s.select} value={form.campaign.status} onChange={(e) => setC("status", e.target.value as "ACTIVE" | "PAUSED")}>
              <option value="ACTIVE">{t("adsCreate.statusActive")}</option>
              <option value="PAUSED">{t("adsCreate.statusPaused")}</option>
            </select>
          </FormField>
          <FormField label={t("adsCreate.meta.fieldDailyBudget")} hint={t("adsCreate.meta.fieldDailyBudgetHint")}>
            <input
              style={s.input}
              type="number"
              min="0"
              step="0.01"
              value={form.campaign.dailyBudget}
              onChange={(e) => setC("dailyBudget", e.target.value)}
            />
          </FormField>
        </div>
      </div>

      {/* Ad Set 层 */}
      <div style={s.card}>
        <h3 style={s.sectionTitle}>{t("adsCreate.stepAdSet")}</h3>
        <div style={s.row}>
          <FormField label={t("adsCreate.meta.fieldAdSetName")} required>
            <input
              style={s.input}
              value={form.adSet.name}
              onChange={(e) => setAS("name", e.target.value)}
            />
          </FormField>
          <FormField label={t("adsCreate.fieldStatus")}>
            <select style={s.select} value={form.adSet.status} onChange={(e) => setAS("status", e.target.value as "ACTIVE" | "PAUSED")}>
              <option value="ACTIVE">{t("adsCreate.statusActive")}</option>
              <option value="PAUSED">{t("adsCreate.statusPaused")}</option>
            </select>
          </FormField>
        </div>
        <div style={s.row}>
          <FormField label={t("adsCreate.meta.fieldStartTime")}>
            <input
              style={s.input}
              type="datetime-local"
              value={form.adSet.startTime?.slice(0, 16) ?? ""}
              onChange={(e) => setAS("startTime", e.target.value)}
            />
          </FormField>
          <FormField label={t("adsCreate.meta.fieldEndTime")}>
            <input
              style={s.input}
              type="datetime-local"
              value={form.adSet.endTime?.slice(0, 16) ?? ""}
              onChange={(e) => setAS("endTime", e.target.value)}
            />
          </FormField>
        </div>
        <div style={s.row}>
          <FormField label={t("adsCreate.meta.fieldAgeMin")}>
            <input
              style={s.input}
              type="number"
              min="13"
              max="65"
              value={form.adSet.ageMin}
              onChange={(e) => setAS("ageMin", e.target.value)}
            />
          </FormField>
          <FormField label={t("adsCreate.meta.fieldAgeMax")}>
            <input
              style={s.input}
              type="number"
              min="13"
              max="65"
              value={form.adSet.ageMax}
              onChange={(e) => setAS("ageMax", e.target.value)}
            />
          </FormField>
          <FormField label={t("adsCreate.fieldGender")}>
            <select style={s.select} value={form.adSet.gender} onChange={(e) => setAS("gender", e.target.value as "ALL" | "MALE" | "FEMALE")}>
              <option value="ALL">{t("adsCreate.genderAll")}</option>
              <option value="MALE">{t("adsCreate.genderMale")}</option>
              <option value="FEMALE">{t("adsCreate.genderFemale")}</option>
            </select>
          </FormField>
        </div>
        <FormField label={t("adsCreate.meta.fieldCountries")} hint={t("adsCreate.meta.fieldCountriesHint")}>
          <input
            style={s.input}
            value={form.adSet.geoCountries}
            onChange={(e) => setAS("geoCountries", e.target.value)}
          />
        </FormField>
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
            <select style={s.select} value={form.ad.status} onChange={(e) => setA("status", e.target.value as "ACTIVE" | "PAUSED")}>
              <option value="ACTIVE">{t("adsCreate.statusActive")}</option>
              <option value="PAUSED">{t("adsCreate.statusPaused")}</option>
            </select>
          </FormField>
        </div>
        <FormField label={t("adsCreate.meta.fieldHeadline")} hint={t("adsCreate.meta.fieldHeadlineHint")}>
          <input
            style={s.input}
            maxLength={40}
            value={form.ad.headline}
            onChange={(e) => setA("headline", e.target.value)}
          />
          <span style={s.charCount}>{form.ad.headline.length}/40</span>
        </FormField>
        <FormField label={t("adsCreate.meta.fieldBody")}>
          <textarea
            style={{ ...s.textarea, minHeight: 80 }}
            value={form.ad.body}
            onChange={(e) => setA("body", e.target.value)}
          />
        </FormField>
        <div style={s.row}>
          <FormField label={t("adsCreate.fieldCta")}>
            <select style={s.select} value={form.ad.callToAction} onChange={(e) => setA("callToAction", e.target.value)}>
              {CTA_OPTIONS.map((cta) => (
                <option key={cta} value={cta}>{cta.replace(/_/g, " ")}</option>
              ))}
            </select>
          </FormField>
          <FormField label={t("adsCreate.fieldImageUrl")} hint={t("adsCreate.fieldImageUrlHint")}>
            <input
              style={s.input}
              value={form.ad.imageUrl}
              onChange={(e) => setA("imageUrl", e.target.value)}
            />
          </FormField>
          <FormField label={t("adsCreate.fieldLinkUrl")}>
            <input
              style={s.input}
              value={form.ad.linkUrl}
              onChange={(e) => setA("linkUrl", e.target.value)}
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
