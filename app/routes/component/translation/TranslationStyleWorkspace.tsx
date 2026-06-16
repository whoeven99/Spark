import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { GlossaryTerm } from "../../../server/translation/glossary.server";
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
  onPageChange?: (page: WorkspacePage) => void;
};

type ProfileListField = "highFrequencyTerms" | "styleNotes";
type SuggestionTarget = "profile" | "glossary";
type WorkspacePage = "overview" | "profile" | "glossary";

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

function resolveWorkspacePage(locationSearch: string): WorkspacePage {
  const params = new URLSearchParams(locationSearch);
  const editor = params.get("styleEditor");
  return editor === "profile" || editor === "glossary" ? editor : "overview";
}

function syncWorkspacePage(page: WorkspacePage) {
  if (typeof window === "undefined") return;
  const nextUrl = new URL(window.location.href);
  if (page === "overview") {
    nextUrl.searchParams.delete("styleEditor");
  } else {
    nextUrl.searchParams.set("styleEditor", page);
  }
  window.history.replaceState(null, "", nextUrl.toString());
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trim()}...`;
}

function formatGlossaryPreview(term: GlossaryTerm): string {
  if (term.doNotTranslate) return "勿译";
  const entries = Object.entries(term.translations ?? {});
  if (!entries.length) return "待补充译法";
  return entries
    .slice(0, 2)
    .map(([locale, text]) => `${locale} → ${text}`)
    .join(" · ");
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
  onPageChange,
}: TranslationStyleWorkspaceProps) {
  const shopify = useAppBridge();

  const [activePage, setActivePage] = useState<WorkspacePage>(() => resolveWorkspacePage(locationSearch));
  const [liveProfile, setLiveProfile] = useState<ShopProfile | null>(null);
  const [profileForm, setProfileForm] = useState<ShopProfile>(() => buildEmptyProfile(sourceLocale));
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileDirty, setProfileDirty] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [glossaryTerms, setGlossaryTerms] = useState<GlossaryTerm[]>([]);
  const [loadingGlossary, setLoadingGlossary] = useState(true);
  const [glossaryError, setGlossaryError] = useState<string | null>(null);
  const [glossaryReloadToken, setGlossaryReloadToken] = useState(0);
  const [activeListEditor, setActiveListEditor] = useState<ProfileListField | null>(null);
  const [aiSuggestionTarget, setAiSuggestionTarget] = useState<SuggestionTarget | null>(null);

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

  const loadGlossary = useCallback(async () => {
    setLoadingGlossary(true);
    try {
      const res = await fetch(`/api/translate/v4/glossary${locationSearch}`);
      const payload = (await res.json()) as {
        ok?: boolean;
        terms?: GlossaryTerm[];
        error?: string;
      };
      if (!res.ok || !payload.ok) throw new Error(payload.error ?? "加载术语表失败");
      setGlossaryError(null);
      setGlossaryTerms(payload.terms ?? []);
    } catch (err) {
      setGlossaryError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingGlossary(false);
    }
  }, [locationSearch]);

  useEffect(() => {
    void loadGlossary();
  }, [loadGlossary, glossaryReloadToken]);

  useEffect(() => {
    syncWorkspacePage(activePage);
  }, [activePage]);

  useEffect(() => {
    onPageChange?.(activePage);
  }, [activePage, onPageChange]);

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

  const openAiSuggestion = (target: SuggestionTarget) => {
    setAiSuggestionTarget(target);
  };

  const handleAiSuggestionApplied = () => {
    setProfileDirty(false);
    void loadLiveProfile();
    void loadGlossary();
    setGlossaryReloadToken((prev) => prev + 1);
  };

  const handleOpenPage = (page: WorkspacePage) => {
    setActivePage(page);
  };

  const handleBackToOverview = () => {
    void loadLiveProfile();
    void loadGlossary();
    setActivePage("overview");
  };

  const profileSummaryItems = [
    profileForm.industry?.trim() ? `行业：${profileForm.industry.trim()}` : null,
    profileForm.toneOfVoice?.trim() ? `语气：${profileForm.toneOfVoice.trim()}` : null,
    profileForm.targetAudience?.trim() ? `受众：${profileForm.targetAudience.trim()}` : null,
    profileForm.highFrequencyTerms.filter(Boolean).length
      ? `高频词 ${profileForm.highFrequencyTerms.filter(Boolean).length} 项`
      : null,
    profileForm.styleNotes.filter(Boolean).length
      ? `风格备注 ${profileForm.styleNotes.filter(Boolean).length} 条`
      : null,
  ].filter(Boolean) as string[];

  const profileInstructionPreview = profileForm.translationInstructions.trim()
    ? truncateText(profileForm.translationInstructions.trim(), 96)
    : "";

  const glossaryPreviewTerms = glossaryTerms.slice(0, 4);
  const glossaryConfiguredCount = glossaryTerms.filter((term) => term.source?.trim()).length;

  return (
    <>
      <div style={singleColumnLayoutStyle}>
        <div style={mainColumnStyle}>
          {activePage === "overview" ? (
            <PageSurface>
              <div style={surfaceHeaderStyle}>
                <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                  <h3 style={surfaceTitleStyle}>翻译风格</h3>
                  <p style={surfaceSubtitleStyle}>
                    商店档案和术语表都改为列表化摘要展示。先在这里快速浏览配置状态，再进入对应编辑页维护完整内容。
                  </p>
                </div>
              </div>

              <div style={overviewListStyle}>
                <div style={overviewItemStyle}>
                  <div style={overviewMainStyle}>
                    <div style={overviewTitleRowStyle}>
                      <div style={overviewTitleStyle}>商店档案</div>
                      <span style={statusBadgeStyle(Boolean(liveProfile?.analyzedAt || profileSummaryItems.length))}>
                        {profileDirty
                          ? "编辑中"
                          : liveProfile?.analyzedAt || profileSummaryItems.length
                            ? "已配置"
                            : "未配置"}
                      </span>
                    </div>
                    <div style={overviewMetaStyle}>
                      <span>源语言：{sourceLocale || profileForm.sourceLanguage || "zh-CN"}</span>
                      <span>
                        {liveProfile?.analyzedAt
                          ? `最近更新：${new Date(liveProfile.analyzedAt).toLocaleString("zh-CN")}`
                          : "尚未保存正式档案"}
                      </span>
                    </div>
                    {loadingProfile ? (
                      <div style={pageHintTextStyle}>加载商店档案中…</div>
                    ) : (
                      <>
                        <div style={overviewSummaryStyle}>
                          {profileSummaryItems.length > 0 ? (
                            profileSummaryItems.map((item) => (
                              <span key={item} style={summaryPreviewChipStyle}>
                                {item}
                              </span>
                            ))
                          ) : (
                            <span style={summaryPreviewEmptyStyle}>尚未填写行业、语气、受众等摘要信息</span>
                          )}
                        </div>
                        {profileInstructionPreview ? (
                          <div style={overviewInstructionStyle}>翻译指令：{profileInstructionPreview}</div>
                        ) : null}
                        {profileError ? <div style={formErrorBoxStyle}>{profileError}</div> : null}
                      </>
                    )}
                  </div>
                  <div style={overviewActionStyle}>
                    <button type="button" style={listActionButtonStyle} onClick={() => handleOpenPage("profile")}>
                      编辑
                    </button>
                  </div>
                </div>

                <div style={overviewItemStyle}>
                  <div style={overviewMainStyle}>
                    <div style={overviewTitleRowStyle}>
                      <div style={overviewTitleStyle}>术语表</div>
                      <span style={statusBadgeStyle(glossaryConfiguredCount > 0)}>
                        {glossaryConfiguredCount > 0 ? `已配置 ${glossaryConfiguredCount} 条` : "未配置"}
                      </span>
                    </div>
                    <div style={overviewMetaStyle}>
                      <span>摘要展示前 4 条术语</span>
                      <span>{loadingGlossary ? "正在同步术语表..." : `当前共 ${glossaryTerms.length} 条`}</span>
                    </div>
                    {loadingGlossary ? (
                      <div style={pageHintTextStyle}>加载术语表中…</div>
                    ) : glossaryError ? (
                      <div style={formErrorBoxStyle}>{glossaryError}</div>
                    ) : glossaryPreviewTerms.length > 0 ? (
                      <div style={overviewGlossaryListStyle}>
                        {glossaryPreviewTerms.map((term, index) => (
                          <div key={`${term.source || "term"}-${index}`} style={overviewGlossaryItemStyle}>
                            <span style={overviewGlossarySourceStyle}>{term.source || "未命名术语"}</span>
                            <span style={overviewGlossaryValueStyle}>{formatGlossaryPreview(term)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={summaryPreviewEmptyStyle}>术语表为空，可在编辑页中手动维护或使用 AI 生成建议</div>
                    )}
                  </div>
                  <div style={overviewActionStyle}>
                    <button type="button" style={listActionButtonStyle} onClick={() => handleOpenPage("glossary")}>
                      编辑
                    </button>
                  </div>
                </div>
              </div>
            </PageSurface>
          ) : null}

          {activePage === "profile" ? (
            <PageSurface>
              <div style={surfaceHeaderStyle}>
                <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                  <button type="button" style={backButtonStyle} onClick={handleBackToOverview}>
                    返回翻译风格列表
                  </button>
                  <h3 style={surfaceTitleStyle}>编辑商店档案</h3>
                  <p style={surfaceSubtitleStyle}>
                    在这里维护行业、语气风格、目标受众和翻译指令。右上角可直接使用 AI 生成建议，再按业务需要微调后保存。
                  </p>
                </div>
                <button type="button" style={secondaryActionButtonStyle} onClick={() => openAiSuggestion("profile")}>
                  生成 AI 建议
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
                <div style={metaBarStyle}>
                  <span>源语言：{sourceLocale || profileForm.sourceLanguage || "zh-CN"}</span>
                  <span>
                    当前状态：
                    {profileDirty
                      ? "有未保存改动"
                      : liveProfile?.analyzedAt
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
                          {profileForm.highFrequencyTerms.filter(Boolean).slice(0, 4).map((item, index) => (
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
                      </div>
                      <div style={listFieldCardStyle}>
                        <div style={listFieldHeaderStyle}>
                          <div style={pageFieldLabelStyle}>风格备注</div>
                          <div style={listFieldHintStyle}>
                            {formatSummaryCount(profileForm.styleNotes.filter(Boolean).length, "条")}
                          </div>
                        </div>
                        <div style={summaryPreviewListStyle}>
                          {profileForm.styleNotes.filter(Boolean).slice(0, 4).map((item, index) => (
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
                      </div>
                      <div style={fieldBlockStyle}>
                        <div style={pageFieldLabelStyle}>翻译指令</div>
                        <textarea
                          rows={4}
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
                        这里保留字段摘要和快捷编辑入口；若需要快速起稿，可先用 AI 生成建议，再按你的品牌表达做修改。
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
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
          ) : null}

          {activePage === "glossary" ? (
            <TranslationGlossaryPanel
              locationSearch={locationSearch}
              reloadToken={glossaryReloadToken}
              onRequestAiSuggestion={() => openAiSuggestion("glossary")}
              mode="full-editor"
              onBack={handleBackToOverview}
            />
          ) : null}
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

      {aiSuggestionTarget ? (
        <div style={overlayBackdropStyle}>
          <div style={suggestionOverlayPanelStyle}>
            <div style={overlayHeaderStyle}>
              <div>
                <h4 style={overlayTitleStyle}>
                  {aiSuggestionTarget === "profile" ? "商店档案 AI 建议" : "术语表 AI 建议"}
                </h4>
              </div>
              <button
                type="button"
                style={overlayCloseButtonStyle}
                onClick={() => {
                  setAiSuggestionTarget(null);
                  handleAiSuggestionApplied();
                }}
              >
                关闭
              </button>
            </div>
            <ShopAnalysisPanel
              locationSearch={locationSearch}
              defaultSourceLanguage={sourceLocale}
              target={aiSuggestionTarget}
              embedded={aiSuggestionTarget === "glossary"}
              onApplied={() => {
                handleAiSuggestionApplied();
                if (aiSuggestionTarget === "profile") {
                  setAiSuggestionTarget(null);
                }
              }}
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
  padding: "0.9rem",
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
  padding: "0.8rem 0.9rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

const overlayHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "0.65rem",
};

const overlayTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "1rem",
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const overlaySubtitleStyle: CSSProperties = {
  marginTop: "0.2rem",
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
  padding: "0.35rem 0.65rem",
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

const overviewListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.9rem",
};

const overviewItemStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: "1rem",
  alignItems: "flex-start",
  padding: "1rem",
  borderRadius: "14px",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: "linear-gradient(180deg, #fbfdfd 0%, #ffffff 100%)",
  boxShadow: "0 8px 22px rgba(15, 23, 42, 0.04)",
};

const overviewMainStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.55rem",
  minWidth: 0,
};

const overviewActionStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
};

const overviewTitleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.55rem",
  flexWrap: "wrap",
};

const overviewTitleStyle: CSSProperties = {
  fontSize: "0.95rem",
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const overviewMetaStyle: CSSProperties = {
  display: "flex",
  gap: "0.75rem",
  flexWrap: "wrap",
  fontSize: "0.75rem",
  color: pageColorTokens.textSecondary,
};

const overviewSummaryStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.45rem",
};

const overviewInstructionStyle: CSSProperties = {
  fontSize: "0.8125rem",
  color: pageColorTokens.textBody,
  lineHeight: 1.55,
};

const overviewGlossaryListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
};

const overviewGlossaryItemStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(120px, 0.8fr) minmax(0, 1.4fr)",
  gap: "0.75rem",
  alignItems: "center",
  padding: "0.55rem 0.7rem",
  borderRadius: "10px",
  background: pageColorTokens.surface,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
};

const overviewGlossarySourceStyle: CSSProperties = {
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: pageColorTokens.textPrimary,
  wordBreak: "break-word",
};

const overviewGlossaryValueStyle: CSSProperties = {
  fontSize: "0.75rem",
  color: pageColorTokens.textSecondary,
  wordBreak: "break-word",
};

function statusBadgeStyle(active: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "0.22rem 0.55rem",
    borderRadius: "999px",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: active ? pageColorTokens.brandGreenDark : pageColorTokens.textSecondary,
    background: active ? pageColorTokens.brandGreenLight : pageColorTokens.surfaceMuted,
    border: `1px solid ${active ? pageColorTokens.brandGreen : pageColorTokens.borderSubtle}`,
  };
}

const listActionButtonStyle: CSSProperties = {
  border: "none",
  background: pageColorTokens.surfaceMuted,
  color: pageColorTokens.textBody,
  cursor: "pointer",
  fontSize: "0.8125rem",
  fontWeight: 600,
  padding: "0.55rem 0.9rem",
  borderRadius: "999px",
  minWidth: "4.5rem",
};

const backButtonStyle: CSSProperties = {
  alignSelf: "flex-start",
  border: "none",
  background: "transparent",
  color: pageColorTokens.brandBlue,
  cursor: "pointer",
  padding: 0,
  marginBottom: "0.5rem",
  fontSize: "0.8125rem",
  fontWeight: 600,
};
