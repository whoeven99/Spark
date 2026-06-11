import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { ShopProfile } from "../../../server/translation/shopAnalysis.server";
import { ShopAnalysisPanel } from "./ShopAnalysisPanel";
import { TranslationGlossaryPanel } from "./TranslationGlossaryPanel";
import {
  PageSurface,
  formErrorBoxStyle,
  pageColorTokens,
  pageFieldLabelStyle,
  pageHintTextStyle,
} from "../../page/pageUiStyles";

type TranslationStyleWorkspaceProps = {
  locationSearch: string;
  sourceLocale: string;
};

type ProfileListField = "highFrequencyTerms" | "styleNotes";

function buildEmptyProfile(sourceLanguage: string): ShopProfile {
  return {
    shopName: "",
    sourceLanguage,
    analyzedAt: "",
    analyzedJobId: "",
    industry: "",
    toneOfVoice: "",
    targetAudience: "",
    highFrequencyTerms: [],
    styleNotes: [],
    translationInstructions: "",
  };
}

function getEditableLineItems(items: string[]): string[] {
  return items.length ? items : [""];
}

function formatSummaryCount(count: number, unit: string): string {
  return count > 0 ? `共 ${count} ${unit}` : `暂无${unit}`;
}

function LineItemsEditorOverlay({
  title,
  subtitle,
  items,
  onChangeItem,
  onAddItem,
  onRemoveItem,
  onClose,
}: {
  title: string;
  subtitle: string;
  items: string[];
  onChangeItem: (index: number, value: string) => void;
  onAddItem: () => void;
  onRemoveItem: (index: number) => void;
  onClose: () => void;
}) {
  const editableItems = getEditableLineItems(items);

  return (
    <div style={overlayBackdropStyle}>
      <div style={overlayPanelStyle}>
        <div style={overlayHeaderStyle}>
          <div>
            <h4 style={overlayTitleStyle}>{title}</h4>
            <div style={overlaySubtitleStyle}>{subtitle}</div>
          </div>
          <button type="button" style={overlayCloseButtonStyle} onClick={onClose}>
            完成
          </button>
        </div>

        <div style={overlayListStyle}>
          {editableItems.map((item, index) => (
            <div key={`${title}-${index}`} style={overlayListRowStyle}>
              <span style={overlayIndexStyle}>{index + 1}</span>
              <input
                type="text"
                value={item}
                onChange={(e) => onChangeItem(index, e.target.value)}
                style={overlayInputStyle}
                placeholder="请输入内容"
              />
              <button
                type="button"
                style={lineEditorActionStyle}
                onClick={() => onRemoveItem(index)}
                disabled={editableItems.length <= 1 && !item}
              >
                删除
              </button>
            </div>
          ))}
        </div>

        <div style={overlayFooterStyle}>
          <button type="button" style={lineEditorAddButtonStyle} onClick={onAddItem}>
            + 新增一行
          </button>
        </div>
      </div>
    </div>
  );
}

export function TranslationStyleWorkspace({
  locationSearch,
  sourceLocale,
}: TranslationStyleWorkspaceProps) {
  const shopify = useAppBridge();

  const [liveProfile, setLiveProfile] = useState<ShopProfile | null>(null);
  const [profileForm, setProfileForm] = useState<ShopProfile>(() => buildEmptyProfile(sourceLocale));
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileDirty, setProfileDirty] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [glossaryReloadToken, setGlossaryReloadToken] = useState(0);
  const [activeListEditor, setActiveListEditor] = useState<ProfileListField | null>(null);
  const [aiSuggestionOpen, setAiSuggestionOpen] = useState(false);

  const loadLiveProfile = useCallback(async () => {
    setLoadingProfile(true);
    try {
      const res = await fetch(`/api/translate/v4/shop-analysis/profile${locationSearch}`);
      const payload = (await res.json()) as { ok?: boolean; profile?: ShopProfile | null; error?: string };
      if (!res.ok || !payload.ok) throw new Error(payload.error ?? "加载商店档案失败");
      const nextProfile = payload.profile ?? buildEmptyProfile(sourceLocale);
      setProfileError(null);
      setLiveProfile(payload.profile ?? null);
      setProfileForm((prev) => (profileDirty ? prev : nextProfile));
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingProfile(false);
    }
  }, [locationSearch, profileDirty, sourceLocale]);

  useEffect(() => {
    void loadLiveProfile();
  }, [loadLiveProfile]);

  useEffect(() => {
    const nextEmptyProfile = buildEmptyProfile(sourceLocale);
    setProfileForm((prev) => {
      if (profileDirty) return prev;
      if (liveProfile) {
        return {
          ...liveProfile,
          sourceLanguage: sourceLocale || liveProfile.sourceLanguage,
        };
      }
      return {
        ...nextEmptyProfile,
        analyzedAt: prev.analyzedAt,
        analyzedJobId: prev.analyzedJobId,
      };
    });
  }, [liveProfile, profileDirty, sourceLocale]);

  const handleProfileFieldChange = (
    field: keyof Pick<
      ShopProfile,
      "industry" | "toneOfVoice" | "targetAudience" | "translationInstructions"
    >,
    value: string,
  ) => {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
    setProfileDirty(true);
  };

  const handleProfileListItemChange = (
    field: keyof Pick<ShopProfile, "highFrequencyTerms" | "styleNotes">,
    index: number,
    value: string,
  ) => {
    setProfileForm((prev) => {
      const current = getEditableLineItems(prev[field]);
      const next = [...current];
      next[index] = value;
      return { ...prev, [field]: next };
    });
    setProfileDirty(true);
  };

  const handleProfileListItemAdd = (
    field: keyof Pick<ShopProfile, "highFrequencyTerms" | "styleNotes">,
  ) => {
    setProfileForm((prev) => ({
      ...prev,
      [field]: [...getEditableLineItems(prev[field]), ""],
    }));
    setProfileDirty(true);
  };

  const handleProfileListItemRemove = (
    field: keyof Pick<ShopProfile, "highFrequencyTerms" | "styleNotes">,
    index: number,
  ) => {
    setProfileForm((prev) => {
      const current = getEditableLineItems(prev[field]);
      const next = current.filter((_, currentIndex) => currentIndex !== index);
      return { ...prev, [field]: next };
    });
    setProfileDirty(true);
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileError(null);
    try {
      const payload: ShopProfile = {
        ...profileForm,
        sourceLanguage: sourceLocale || profileForm.sourceLanguage || "zh-CN",
        analyzedAt: profileForm.analyzedAt || new Date().toISOString(),
        analyzedJobId: profileForm.analyzedJobId || "manual",
        highFrequencyTerms: profileForm.highFrequencyTerms.map((item) => item.trim()).filter(Boolean),
        styleNotes: profileForm.styleNotes.map((item) => item.trim()).filter(Boolean),
      };
      const res = await fetch(`/api/translate/v4/shop-analysis/profile${locationSearch}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !result.ok) throw new Error(result.error ?? "保存失败");
      setLiveProfile(payload);
      setProfileForm(payload);
      setProfileDirty(false);
      setGlossaryReloadToken((prev) => prev + 1);
      shopify.toast.show("商店档案已保存");
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const openAiSuggestion = () => {
    setAiSuggestionOpen(true);
  };

  const handleAiSuggestionApplied = () => {
    void loadLiveProfile();
    setGlossaryReloadToken((prev) => prev + 1);
  };

  return (
    <>
      <div style={singleColumnLayoutStyle}>
        <div style={mainColumnStyle}>
          <PageSurface>
            <div style={surfaceHeaderStyle}>
              <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                <h3 style={surfaceTitleStyle}>商店档案</h3>
                <p style={surfaceSubtitleStyle}>
                  在这里维护行业、语气风格、目标受众和翻译指令。AI 建议作为内容填充入口，放在编辑流和空状态中按需使用。
                </p>
              </div>
              <button type="button" style={secondaryActionButtonStyle} onClick={openAiSuggestion}>
                生成 AI 建议
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
              <div style={metaBarStyle}>
                <span>源语言：{sourceLocale || profileForm.sourceLanguage || "zh-CN"}</span>
                <span>
                  当前状态：
                  {liveProfile?.analyzedAt
                    ? `已应用 · ${new Date(liveProfile.analyzedAt).toLocaleString("zh-CN")}`
                    : "未保存"}
                </span>
              </div>

              {loadingProfile ? (
                <div style={pageHintTextStyle}>加载商店档案中…</div>
              ) : (
                <>
                  <div style={formStackStyle}>
                    <div style={fieldBlockStyle}>
                      <div style={pageFieldLabelStyle}>行业</div>
                      <input
                        type="text"
                        value={profileForm.industry}
                        onChange={(e) => handleProfileFieldChange("industry", e.target.value)}
                        style={inputStyle}
                        placeholder="例如：美妆护肤 / 家居用品 / 宠物用品"
                      />
                    </div>
                    <div style={fieldBlockStyle}>
                      <div style={pageFieldLabelStyle}>语气风格</div>
                      <input
                        type="text"
                        value={profileForm.toneOfVoice}
                        onChange={(e) => handleProfileFieldChange("toneOfVoice", e.target.value)}
                        style={inputStyle}
                        placeholder="例如：简洁专业、轻松友好"
                      />
                    </div>
                    <div style={fieldBlockStyle}>
                      <div style={pageFieldLabelStyle}>目标受众</div>
                      <input
                        type="text"
                        value={profileForm.targetAudience}
                        onChange={(e) => handleProfileFieldChange("targetAudience", e.target.value)}
                        style={inputStyle}
                        placeholder="例如：北美年轻女性、精品咖啡爱好者"
                      />
                    </div>
                    <div style={listFieldCardStyle}>
                      <div style={listFieldHeaderStyle}>
                        <div style={pageFieldLabelStyle}>高频词</div>
                        <div style={listFieldHintStyle}>
                          {formatSummaryCount(profileForm.highFrequencyTerms.filter(Boolean).length, "项")}
                        </div>
                      </div>
                      <div style={summaryPreviewListStyle}>
                        {profileForm.highFrequencyTerms.filter(Boolean).slice(0, 3).map((item, index) => (
                          <div key={`high-frequency-preview-${index}`} style={summaryPreviewChipStyle}>
                            {item}
                          </div>
                        ))}
                        {!profileForm.highFrequencyTerms.filter(Boolean).length ? (
                          <div style={summaryPreviewEmptyStyle}>尚未添加高频词</div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        style={summaryEditButtonStyle}
                        onClick={() => setActiveListEditor("highFrequencyTerms")}
                      >
                        编辑高频词
                      </button>
                      {!profileForm.highFrequencyTerms.filter(Boolean).length ? (
                        <button type="button" style={ghostSuggestionButtonStyle} onClick={openAiSuggestion}>
                          生成填充建议
                        </button>
                      ) : null}
                    </div>
                    <div style={listFieldCardStyle}>
                      <div style={listFieldHeaderStyle}>
                        <div style={pageFieldLabelStyle}>风格备注</div>
                        <div style={listFieldHintStyle}>
                          {formatSummaryCount(profileForm.styleNotes.filter(Boolean).length, "条")}
                        </div>
                      </div>
                      <div style={summaryPreviewListStyle}>
                        {profileForm.styleNotes.filter(Boolean).slice(0, 3).map((item, index) => (
                          <div key={`style-note-preview-${index}`} style={summaryPreviewChipStyle}>
                            {item}
                          </div>
                        ))}
                        {!profileForm.styleNotes.filter(Boolean).length ? (
                          <div style={summaryPreviewEmptyStyle}>尚未添加风格备注</div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        style={summaryEditButtonStyle}
                        onClick={() => setActiveListEditor("styleNotes")}
                      >
                        编辑风格备注
                      </button>
                      {!profileForm.styleNotes.filter(Boolean).length ? (
                        <button type="button" style={ghostSuggestionButtonStyle} onClick={openAiSuggestion}>
                          生成填充建议
                        </button>
                      ) : null}
                    </div>
                    <div style={fieldBlockStyle}>
                      <div style={pageFieldLabelStyle}>翻译指令</div>
                      <textarea
                        rows={3}
                        value={profileForm.translationInstructions}
                        onChange={(e) => handleProfileFieldChange("translationInstructions", e.target.value)}
                        style={textareaStyle}
                        placeholder="例如：优先保留品牌表达，不要过度营销化，保持可读性与自然度。"
                      />
                    </div>
                  </div>

                  {profileError ? <div style={formErrorBoxStyle}>{profileError}</div> : null}

                  <div style={footerRowStyle}>
                    <div style={{ ...pageHintTextStyle, marginTop: 0 }}>
                      高频词和风格备注在本页以摘要形式展示，点击对应编辑入口可进入完整编辑界面维护内容。
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      {!liveProfile ? (
                        <button type="button" style={secondaryActionButtonStyle} onClick={openAiSuggestion}>
                          生成 AI 建议
                        </button>
                      ) : null}
                      <s-button
                        type="button"
                        variant="primary"
                        onClick={() => void handleSaveProfile()}
                        {...(savingProfile ? { disabled: true } : {})}
                      >
                        {savingProfile ? "保存中…" : profileDirty ? "保存商店档案" : "重新保存商店档案"}
                      </s-button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </PageSurface>

          <div style={glossaryPanelWrapStyle}>
            <TranslationGlossaryPanel
              locationSearch={locationSearch}
              reloadToken={glossaryReloadToken}
              onRequestAiSuggestion={openAiSuggestion}
            />
          </div>
        </div>
      </div>

      {activeListEditor === "highFrequencyTerms" ? (
        <LineItemsEditorOverlay
          title="编辑高频词"
          subtitle="适合维护品牌名、固定卖点、活动词等高频表达。"
          items={profileForm.highFrequencyTerms}
          onChangeItem={(index, value) => handleProfileListItemChange("highFrequencyTerms", index, value)}
          onAddItem={() => handleProfileListItemAdd("highFrequencyTerms")}
          onRemoveItem={(index) => handleProfileListItemRemove("highFrequencyTerms", index)}
          onClose={() => setActiveListEditor(null)}
        />
      ) : null}

      {activeListEditor === "styleNotes" ? (
        <LineItemsEditorOverlay
          title="编辑风格备注"
          subtitle="适合维护语气限制、品牌调性、表达偏好等风格规则。"
          items={profileForm.styleNotes}
          onChangeItem={(index, value) => handleProfileListItemChange("styleNotes", index, value)}
          onAddItem={() => handleProfileListItemAdd("styleNotes")}
          onRemoveItem={(index) => handleProfileListItemRemove("styleNotes", index)}
          onClose={() => setActiveListEditor(null)}
        />
      ) : null}

      {aiSuggestionOpen ? (
        <div style={overlayBackdropStyle}>
          <div style={suggestionOverlayPanelStyle}>
            <div style={overlayHeaderStyle}>
              <div>
                <h4 style={overlayTitleStyle}>AI 建议</h4>
                <div style={overlaySubtitleStyle}>
                  这里会为商店档案和术语表生成可编辑的填充建议；保存或确认生效后会同步回当前页面。
                </div>
              </div>
              <button
                type="button"
                style={overlayCloseButtonStyle}
                onClick={() => {
                  setAiSuggestionOpen(false);
                  handleAiSuggestionApplied();
                }}
              >
                关闭
              </button>
            </div>
            <ShopAnalysisPanel
              locationSearch={locationSearch}
              defaultSourceLanguage={sourceLocale}
              onApplied={handleAiSuggestionApplied}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

const singleColumnLayoutStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};

const mainColumnStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: "1.25rem",
};

const surfaceHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "0.75rem",
  flexWrap: "wrap",
  marginBottom: "1rem",
};

const surfaceTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "1.05rem",
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const surfaceSubtitleStyle: CSSProperties = {
  margin: "0.3rem 0 0",
  fontSize: "0.8125rem",
  lineHeight: 1.55,
  color: pageColorTokens.textSecondary,
};

const metaBarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "0.75rem",
  flexWrap: "wrap",
  padding: "0.7rem 0.8rem",
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: "0.75rem",
  color: pageColorTokens.textSecondary,
};

const formStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.95rem",
};

const fieldBlockStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.38rem",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.65rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.borderInput}`,
  fontSize: "0.875rem",
  color: pageColorTokens.textBody,
  boxSizing: "border-box",
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  fontFamily: "inherit",
  lineHeight: 1.55,
  minHeight: "4.8rem",
  maxHeight: "6.8rem",
};

const listFieldCardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.65rem",
  padding: "0.9rem 1rem",
  borderRadius: "12px",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: "linear-gradient(180deg, #f8fbfb 0%, #ffffff 100%)",
  boxShadow: "0 8px 22px rgba(15, 23, 42, 0.04)",
};

const listFieldHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.6rem",
  flexWrap: "wrap",
};

const listFieldHintStyle: CSSProperties = {
  fontSize: "0.75rem",
  color: pageColorTokens.textSecondary,
};

const summaryPreviewListStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.45rem",
};

const summaryPreviewChipStyle: CSSProperties = {
  padding: "0.4rem 0.6rem",
  borderRadius: "999px",
  background: pageColorTokens.surface,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: "0.75rem",
  color: pageColorTokens.textBody,
};

const summaryPreviewEmptyStyle: CSSProperties = {
  fontSize: "0.75rem",
  color: pageColorTokens.textSecondary,
};

const summaryEditButtonStyle: CSSProperties = {
  alignSelf: "flex-start",
  border: "none",
  background: pageColorTokens.surfaceMuted,
  color: pageColorTokens.textBody,
  cursor: "pointer",
  fontSize: "0.8125rem",
  padding: "0.45rem 0.7rem",
  borderRadius: "999px",
};

const ghostSuggestionButtonStyle: CSSProperties = {
  ...summaryEditButtonStyle,
  background: "transparent",
  border: `1px dashed ${pageColorTokens.borderSubtle}`,
};

const secondaryActionButtonStyle: CSSProperties = {
  border: "none",
  background: pageColorTokens.surfaceMuted,
  color: pageColorTokens.textBody,
  cursor: "pointer",
  fontSize: "0.8125rem",
  padding: "0.5rem 0.8rem",
  borderRadius: "999px",
};

const overlayBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.24)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1.25rem",
  zIndex: 80,
};

const overlayPanelStyle: CSSProperties = {
  width: "min(760px, 100%)",
  maxHeight: "80vh",
  overflow: "auto",
  borderRadius: "20px",
  background: "#ffffff",
  boxShadow: "0 24px 60px rgba(15, 23, 42, 0.18)",
  padding: "1rem",
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};

const suggestionOverlayPanelStyle: CSSProperties = {
  width: "min(1120px, 100%)",
  maxHeight: "88vh",
  overflow: "auto",
  borderRadius: "20px",
  background: "#ffffff",
  boxShadow: "0 24px 60px rgba(15, 23, 42, 0.18)",
  padding: "1rem",
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};

const overlayHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "0.8rem",
};

const overlayTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "1rem",
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const overlaySubtitleStyle: CSSProperties = {
  marginTop: "0.3rem",
  fontSize: "0.8125rem",
  color: pageColorTokens.textSecondary,
  lineHeight: 1.5,
};

const overlayCloseButtonStyle: CSSProperties = {
  border: "none",
  background: pageColorTokens.surfaceMuted,
  color: pageColorTokens.textBody,
  cursor: "pointer",
  fontSize: "0.8125rem",
  padding: "0.45rem 0.75rem",
  borderRadius: "999px",
};

const overlayListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.6rem",
};

const overlayListRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
};

const overlayIndexStyle: CSSProperties = {
  width: "1.5rem",
  flexShrink: 0,
  fontSize: "0.75rem",
  color: pageColorTokens.textSecondary,
  textAlign: "center",
};

const overlayInputStyle: CSSProperties = {
  ...inputStyle,
  flex: "1 1 auto",
  minWidth: 0,
};

const lineEditorActionStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: pageColorTokens.textSecondary,
  cursor: "pointer",
  fontSize: "0.75rem",
  padding: "0.25rem 0.35rem",
  borderRadius: "8px",
};

const lineEditorAddButtonStyle: CSSProperties = {
  alignSelf: "flex-start",
  border: "none",
  background: pageColorTokens.surfaceMuted,
  color: pageColorTokens.textBody,
  cursor: "pointer",
  fontSize: "0.8125rem",
  padding: "0.45rem 0.7rem",
  borderRadius: "999px",
};

const overlayFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
};

const footerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  flexWrap: "wrap",
};

const glossaryPanelWrapStyle: CSSProperties = {
  marginTop: "0.45rem",
};
