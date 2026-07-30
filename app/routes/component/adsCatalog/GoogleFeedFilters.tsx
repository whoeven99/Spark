import { useTranslation } from "react-i18next";
import {
  pageColorTokens,
  pageFieldLabelStyle,
  pageHintTextStyle,
  pageSelectStyle,
} from "../../page/pageUiStyles";

export interface GoogleFiltersValue {
  tags: string;
  productTypes: string;
  vendors: string;
  inStockOnly: boolean;
  contentLanguage: string;
  targetCountry: string;
  googleProductCategory: string;
}

type Props = {
  value: GoogleFiltersValue;
  onChange: (next: GoogleFiltersValue) => void;
  /** 是否展示 Google 专属字段（内容语言 / 目标国家 / Google 类目）。默认展示。 */
  showGoogleFields?: boolean;
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.borderInput}`,
  fontSize: 13,
  fontFamily: "inherit",
  marginTop: 6,
};

export function parseList(raw: string): string[] {
  return raw
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function GoogleFeedFilters({ value, onChange, showGoogleFields = true }: Props) {
  const { t } = useTranslation();
  const set = (patch: Partial<GoogleFiltersValue>) => onChange({ ...value, ...patch });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
        {t("adsCatalog.filterSectionTitle")}
      </h3>

      <div>
        <label style={pageFieldLabelStyle}>{t("adsCatalog.filterTags")}</label>
        <input
          style={inputStyle}
          value={value.tags}
          onChange={(e) => set({ tags: e.target.value })}
          placeholder={t("adsCatalog.filterTagsPlaceholder")}
        />
      </div>
      <div>
        <label style={pageFieldLabelStyle}>{t("adsCatalog.filterTypes")}</label>
        <input
          style={inputStyle}
          value={value.productTypes}
          onChange={(e) => set({ productTypes: e.target.value })}
          placeholder={t("adsCatalog.filterTypesPlaceholder")}
        />
      </div>
      <div>
        <label style={pageFieldLabelStyle}>{t("adsCatalog.filterVendors")}</label>
        <input
          style={inputStyle}
          value={value.vendors}
          onChange={(e) => set({ vendors: e.target.value })}
          placeholder={t("adsCatalog.filterVendorsPlaceholder")}
        />
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <input
          type="checkbox"
          checked={value.inStockOnly}
          onChange={(e) => set({ inStockOnly: e.target.checked })}
        />
        {t("adsCatalog.filterInStockOnly")}
      </label>

      {showGoogleFields && (
        <>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <label style={pageFieldLabelStyle}>{t("adsCatalog.fieldContentLanguage")}</label>
              <select
                value={value.contentLanguage}
                onChange={(e) => set({ contentLanguage: e.target.value })}
                style={{ ...pageSelectStyle, marginTop: 6 }}
              >
                {["en", "zh-CN", "es", "fr", "de", "ja", "pt-BR"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={pageFieldLabelStyle}>{t("adsCatalog.fieldTargetCountry")}</label>
              <select
                value={value.targetCountry}
                onChange={(e) => set({ targetCountry: e.target.value })}
                style={{ ...pageSelectStyle, marginTop: 6 }}
              >
                {["US", "GB", "CA", "AU", "DE", "FR", "JP", "BR"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={pageFieldLabelStyle}>{t("adsCatalog.filterGoogleCategory")}</label>
            <input
              style={inputStyle}
              value={value.googleProductCategory}
              onChange={(e) => set({ googleProductCategory: e.target.value })}
              placeholder={t("adsCatalog.filterGoogleCategoryPlaceholder")}
            />
            <p style={pageHintTextStyle}>{t("adsCatalog.filterGoogleCategoryHint")}</p>
          </div>
        </>
      )}
    </div>
  );
}
