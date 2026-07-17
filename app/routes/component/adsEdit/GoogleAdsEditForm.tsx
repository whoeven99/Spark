import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formStyles as s, FormField, SubmitResult } from "../adsCreate/formShared";
import { pageColorTokens } from "../../page/pageUiStyles";
import type { GoogleAdsEditDetail, GoogleEditFormData } from "./types";

interface Props {
  detail: GoogleAdsEditDetail;
  locationSearch: string;
  onSuccess: () => void;
}

function detailToForm(detail: GoogleAdsEditDetail): GoogleEditFormData {
  return {
    campaign: {
      name: detail.campaign.name,
      status: detail.campaign.status,
      dailyBudget: detail.campaign.dailyBudget,
      resourceName: detail.campaign.resourceName,
      budgetResourceName: detail.campaign.budgetResourceName,
    },
    adGroup: {
      name: detail.adGroup.name,
      status: detail.adGroup.status,
      cpcBid: detail.adGroup.cpcBid,
      resourceName: detail.adGroup.resourceName,
    },
    ad: {
      name: detail.ad.name,
      finalUrl: detail.ad.finalUrl,
      headlines: detail.ad.headlines.length >= 3
        ? detail.ad.headlines
        : [...detail.ad.headlines, ...Array(3 - detail.ad.headlines.length).fill("")],
      descriptions: detail.ad.descriptions.length >= 2
        ? detail.ad.descriptions
        : [...detail.ad.descriptions, ...Array(2 - detail.ad.descriptions.length).fill("")],
      resourceName: detail.ad.resourceName,
    },
  };
}

const MIN_HEADLINES = 3;
const MAX_HEADLINES = 15;
const MIN_DESCRIPTIONS = 2;
const MAX_DESCRIPTIONS = 4;

export function GoogleAdsEditForm({ detail, locationSearch, onSuccess }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<GoogleEditFormData>(() => detailToForm(detail));
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function setC<K extends keyof GoogleEditFormData["campaign"]>(
    key: K, value: GoogleEditFormData["campaign"][K],
  ) { setForm((prev) => ({ ...prev, campaign: { ...prev.campaign, [key]: value } })); }

  function setG<K extends keyof GoogleEditFormData["adGroup"]>(
    key: K, value: GoogleEditFormData["adGroup"][K],
  ) { setForm((prev) => ({ ...prev, adGroup: { ...prev.adGroup, [key]: value } })); }

  function setA<K extends keyof GoogleEditFormData["ad"]>(
    key: K, value: GoogleEditFormData["ad"][K],
  ) { setForm((prev) => ({ ...prev, ad: { ...prev.ad, [key]: value } })); }

  function setHeadline(idx: number, value: string) {
    setForm((prev) => {
      const headlines = [...prev.ad.headlines];
      headlines[idx] = value;
      return { ...prev, ad: { ...prev.ad, headlines } };
    });
  }

  function addHeadline() {
    if (form.ad.headlines.length >= MAX_HEADLINES) return;
    setForm((prev) => ({ ...prev, ad: { ...prev.ad, headlines: [...prev.ad.headlines, ""] } }));
  }

  function removeHeadline(idx: number) {
    if (form.ad.headlines.length <= MIN_HEADLINES) return;
    setForm((prev) => {
      const headlines = prev.ad.headlines.filter((_, i) => i !== idx);
      return { ...prev, ad: { ...prev.ad, headlines } };
    });
  }

  function setDescription(idx: number, value: string) {
    setForm((prev) => {
      const descriptions = [...prev.ad.descriptions];
      descriptions[idx] = value;
      return { ...prev, ad: { ...prev.ad, descriptions } };
    });
  }

  function addDescription() {
    if (form.ad.descriptions.length >= MAX_DESCRIPTIONS) return;
    setForm((prev) => ({ ...prev, ad: { ...prev.ad, descriptions: [...prev.ad.descriptions, ""] } }));
  }

  function removeDescription(idx: number) {
    if (form.ad.descriptions.length <= MIN_DESCRIPTIONS) return;
    setForm((prev) => {
      const descriptions = prev.ad.descriptions.filter((_, i) => i !== idx);
      return { ...prev, ad: { ...prev.ad, descriptions } };
    });
  }

  async function handleSubmit() {
    setSubmitting(true);
    setResult(null);
    try {
      const resp = await fetch(`/api/ads-edit${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "google",
          campaignId: detail.campaign.id,
          adSetId: detail.adGroup.id,
          adId: detail.ad.id,
          google: form,
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
            <select style={s.select} value={form.campaign.status} onChange={(e) => setC("status", e.target.value as "ENABLED" | "PAUSED")}>
              <option value="ENABLED">{t("adsCreate.statusActive")}</option>
              <option value="PAUSED">{t("adsCreate.statusPaused")}</option>
            </select>
          </FormField>
          <FormField label={t("adsCreate.google.fieldDailyBudget")} hint={t("adsCreate.google.fieldDailyBudgetHint")}>
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

      {/* Ad Group 层 */}
      <div style={s.card}>
        <h3 style={s.sectionTitle}>{t("adsCreate.stepAdGroup")}</h3>
        <div style={s.row}>
          <FormField label={t("adsCreate.google.fieldAdGroupName")} required>
            <input
              style={s.input}
              value={form.adGroup.name}
              onChange={(e) => setG("name", e.target.value)}
            />
          </FormField>
          <FormField label={t("adsCreate.fieldStatus")}>
            <select style={s.select} value={form.adGroup.status} onChange={(e) => setG("status", e.target.value as "ENABLED" | "PAUSED")}>
              <option value="ENABLED">{t("adsCreate.statusActive")}</option>
              <option value="PAUSED">{t("adsCreate.statusPaused")}</option>
            </select>
          </FormField>
          <FormField label={t("adsCreate.google.fieldCpcBid")} hint={t("adsCreate.google.fieldCpcBidHint")}>
            <input
              style={s.input}
              type="number"
              min="0"
              step="0.01"
              value={form.adGroup.cpcBid}
              onChange={(e) => setG("cpcBid", e.target.value)}
            />
          </FormField>
        </div>
      </div>

      {/* RSA 层 */}
      <div style={s.card}>
        <h3 style={s.sectionTitle}>{t("adsCreate.google.stepRsa")}</h3>
        <FormField label={t("adsCreate.google.fieldFinalUrl")} required>
          <input
            style={s.input}
            value={form.ad.finalUrl}
            onChange={(e) => setA("finalUrl", e.target.value)}
          />
        </FormField>

        {/* 标题列表 */}
        <div>
          <label style={s.label}>
            {t("adsCreate.google.fieldHeadlines")}
            <span style={{ color: pageColorTokens.textSecondary, fontWeight: 400, marginLeft: 6 }}>
              {t("adsCreate.google.fieldHeadlinesHint", { min: MIN_HEADLINES, max: MAX_HEADLINES })}
            </span>
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {form.ad.headlines.map((h, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  style={{ ...s.input, flex: 1 }}
                  maxLength={30}
                  placeholder={t("adsCreate.google.headlinePlaceholder", { n: i + 1 })}
                  value={h}
                  onChange={(e) => setHeadline(i, e.target.value)}
                />
                <span style={{ fontSize: 11, color: pageColorTokens.textSecondary, flexShrink: 0 }}>
                  {h.length}/30
                </span>
                {form.ad.headlines.length > MIN_HEADLINES && (
                  <button
                    type="button"
                    onClick={() => removeHeadline(i)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: pageColorTokens.textSecondary,
                      fontSize: 16,
                      padding: "0 4px",
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          {form.ad.headlines.length < MAX_HEADLINES && (
            <button
              type="button"
              onClick={addHeadline}
              style={{ ...s.btnSecondary, marginTop: 8, fontSize: 12, padding: "6px 12px" }}
            >
              + {t("adsCreate.google.addHeadline")}
            </button>
          )}
        </div>

        {/* 描述列表 */}
        <div>
          <label style={s.label}>
            {t("adsCreate.google.fieldDescriptions")}
            <span style={{ color: pageColorTokens.textSecondary, fontWeight: 400, marginLeft: 6 }}>
              {t("adsCreate.google.fieldDescriptionsHint", { min: MIN_DESCRIPTIONS, max: MAX_DESCRIPTIONS })}
            </span>
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {form.ad.descriptions.map((d, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  style={{ ...s.input, flex: 1 }}
                  maxLength={90}
                  placeholder={t("adsCreate.google.descriptionPlaceholder", { n: i + 1 })}
                  value={d}
                  onChange={(e) => setDescription(i, e.target.value)}
                />
                <span style={{ fontSize: 11, color: pageColorTokens.textSecondary, flexShrink: 0 }}>
                  {d.length}/90
                </span>
                {form.ad.descriptions.length > MIN_DESCRIPTIONS && (
                  <button
                    type="button"
                    onClick={() => removeDescription(i)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: pageColorTokens.textSecondary,
                      fontSize: 16,
                      padding: "0 4px",
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          {form.ad.descriptions.length < MAX_DESCRIPTIONS && (
            <button
              type="button"
              onClick={addDescription}
              style={{ ...s.btnSecondary, marginTop: 8, fontSize: 12, padding: "6px 12px" }}
            >
              + {t("adsCreate.google.addDescription")}
            </button>
          )}
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
