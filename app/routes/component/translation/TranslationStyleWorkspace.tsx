import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useResponsiveLayout } from "../../../hooks/useResponsiveLayout";
import type { GlossaryTerm } from "../../../server/translation/glossary.server";
import type {
  ShopAnalysisJob,
  ShopProfile,
} from "../../../server/translation/shopAnalysis.server";
import { formatActualElapsed } from "../aiTask/AITaskCardShell";
import { TranslationGlossaryPanel } from "./TranslationGlossaryPanel";
import {
  PageSurface,
  formErrorBoxStyle,
  pageColorTokens,
  pageFieldLabelStyle,
  pageHintTextStyle,
  pageInnerPanelStyle,
  stickyAsideColumnStyle,
  twoColumnLayoutStyle,
  twoColumnMainStyle,
} from "../../page/pageUiStyles";

type TranslationStyleWorkspaceProps = {
  locationSearch: string;
  sourceLocale: string;
};

type DraftStatusPayload = {
  terms?: GlossaryTerm[];
  status?: string | null;
  generatedAt?: string | null;
};

const RUNNING_STATUSES = new Set(["SCAN_QUEUED", "SCANNING", "ANALYZE_QUEUED", "ANALYZING"]);
const QUEUED_STATUSES = new Set(["SCAN_QUEUED", "ANALYZE_QUEUED"]);
const PROCESSING_STATUSES = new Set(["SCANNING", "ANALYZING"]);

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

function statusLabel(status: string): string {
  switch (status) {
    case "SCAN_QUEUED":
      return "等待扫描";
    case "SCANNING":
      return "扫描中";
    case "ANALYZE_QUEUED":
      return "等待分析";
    case "ANALYZING":
      return "分析中";
    case "COMPLETED":
      return "已完成";
    case "FAILED":
      return "失败";
    default:
      return status;
  }
}

function statusTone(status: string): { color: string; background: string; border: string } {
  if (status === "COMPLETED") {
    return {
      color: pageColorTokens.brandGreenDark,
      background: pageColorTokens.brandGreenLight,
      border: `${pageColorTokens.brandGreen}55`,
    };
  }
  if (status === "FAILED") {
    return {
      color: pageColorTokens.criticalText,
      background: "#fff0ee",
      border: "#f3cbc5",
    };
  }
  if (RUNNING_STATUSES.has(status)) {
    return {
      color: "#8a420f",
      background: "#fff1e8",
      border: "#f3d1b8",
    };
  }
  return {
    color: pageColorTokens.textSecondary,
    background: pageColorTokens.surfaceMuted,
    border: pageColorTokens.borderSubtle,
  };
}

function formatProfileSummary(profile: ShopProfile): Array<{ label: string; value: string }> {
  return [
    { label: "行业", value: profile.industry || "—" },
    { label: "语气风格", value: profile.toneOfVoice || "—" },
    { label: "目标受众", value: profile.targetAudience || "—" },
    {
      label: "高频词",
      value: profile.highFrequencyTerms.length ? profile.highFrequencyTerms.join(" / ") : "—",
    },
    {
      label: "风格备注",
      value: profile.styleNotes.length ? profile.styleNotes.join(" / ") : "—",
    },
    {
      label: "翻译指令",
      value: profile.translationInstructions || "—",
    },
  ];
}

function shallowProfileEquals(a: ShopProfile, b: ShopProfile): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function renderLineItems(items: string[], emptyText: string) {
  if (!items.length) {
    return <div style={lineItemEmptyStyle}>{emptyText}</div>;
  }
  return (
    <div style={lineItemListStyle}>
      {items.map((item, index) => (
        <div key={`${item}-${index}`} style={lineItemRowStyle}>
          {item}
        </div>
      ))}
    </div>
  );
}

export function TranslationStyleWorkspace({
  locationSearch,
  sourceLocale,
}: TranslationStyleWorkspaceProps) {
  const shopify = useAppBridge();
  const { isMobile } = useResponsiveLayout();
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [liveProfile, setLiveProfile] = useState<ShopProfile | null>(null);
  const [profileForm, setProfileForm] = useState<ShopProfile>(() => buildEmptyProfile(sourceLocale));
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileDirty, setProfileDirty] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [job, setJob] = useState<ShopAnalysisJob | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [draftProfile, setDraftProfile] = useState<ShopProfile | null>(null);
  const [draftTerms, setDraftTerms] = useState<GlossaryTerm[]>([]);
  const [draftStatus, setDraftStatus] = useState<string | null>(null);
  const [draftGeneratedAt, setDraftGeneratedAt] = useState<string | null>(null);
  const [glossaryApplyMode, setGlossaryApplyMode] = useState<"merge" | "replace">("merge");
  const [applyingGlossary, setApplyingGlossary] = useState(false);
  const [glossaryReloadToken, setGlossaryReloadToken] = useState(0);

  const isRunning = Boolean(job && RUNNING_STATUSES.has(job.status));

  const loadLiveProfile = useCallback(async () => {
    setLoadingProfile(true);
    try {
      const res = await fetch(`/api/translate/v4/shop-analysis/profile${locationSearch}`);
      const payload = (await res.json()) as { ok?: boolean; profile?: ShopProfile | null; error?: string };
      if (!res.ok || !payload.ok) throw new Error(payload.error ?? "加载商店档案失败");
      const nextProfile = payload.profile ?? buildEmptyProfile(sourceLocale);
      setProfileError(null);
      setLiveProfile(payload.profile ?? null);
      setDraftProfile(payload.profile ?? null);
      setProfileForm((prev) =>
        profileDirty ? prev : nextProfile,
      );
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingProfile(false);
    }
  }, [locationSearch, profileDirty, sourceLocale]);

  const loadDraftGlossary = useCallback(async () => {
    try {
      const res = await fetch(`/api/translate/v4/shop-analysis/glossary-draft${locationSearch}`);
      const payload = (await res.json()) as { ok?: boolean } & DraftStatusPayload;
      if (payload.ok) {
        setDraftTerms(payload.terms ?? []);
        setDraftStatus(payload.status ?? null);
        setDraftGeneratedAt(payload.generatedAt ?? null);
      }
    } catch {
      // ignore
    }
  }, [locationSearch]);

  const loadJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/translate/v4/shop-analysis${locationSearch}`);
      const payload = (await res.json()) as { ok?: boolean; job?: ShopAnalysisJob | null };
      if (payload.ok) setJob(payload.job ?? null);
    } catch {
      // ignore
    }
  }, [locationSearch]);

  useEffect(() => {
    void loadLiveProfile();
    void loadDraftGlossary();
    void loadJob();
  }, [loadDraftGlossary, loadJob, loadLiveProfile]);

  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (isRunning) {
      pollingRef.current = setInterval(() => {
        void loadJob();
      }, 5000);
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [isRunning, loadJob]);

  const previousJobStatus = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (job?.status === "COMPLETED" && previousJobStatus.current !== "COMPLETED") {
      void loadLiveProfile();
      void loadDraftGlossary();
    }
    previousJobStatus.current = job?.status;
  }, [job?.status, loadDraftGlossary, loadLiveProfile]);

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

  const draftProfileSummary = useMemo(
    () => (draftProfile ? formatProfileSummary(draftProfile) : []),
    [draftProfile],
  );

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

  const handleProfileListChange = (
    field: keyof Pick<ShopProfile, "highFrequencyTerms" | "styleNotes">,
    value: string,
  ) => {
    setProfileForm((prev) => ({
      ...prev,
      [field]: value
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
    }));
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
      shopify.toast.show("商店档案已保存");
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleTriggerAi = async () => {
    setAiError(null);
    setTriggering(true);
    try {
      const res = await fetch(`/api/translate/v4/shop-analysis${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceLanguage: sourceLocale || profileForm.sourceLanguage || "zh-CN",
        }),
      });
      const payload = (await res.json()) as { ok?: boolean; job?: ShopAnalysisJob; error?: string };
      if (!res.ok || !payload.ok) throw new Error(payload.error ?? "启动失败");
      setJob(payload.job ?? null);
      shopify.toast.show("已开始生成 AI 方案");
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setTriggering(false);
    }
  };

  const handleApplyDraftProfile = () => {
    if (!draftProfile) return;
    const nextForm = {
      ...draftProfile,
      sourceLanguage: sourceLocale || draftProfile.sourceLanguage || "zh-CN",
    };
    setProfileForm(nextForm);
    setProfileDirty(!liveProfile || !shallowProfileEquals(nextForm, liveProfile));
    shopify.toast.show("已回填到商店档案表单，请保存后生效");
  };

  const handleApplyGlossary = async () => {
    if (!draftTerms.length) return;
    setApplyingGlossary(true);
    setAiError(null);
    try {
      const res = await fetch(`/api/translate/v4/shop-analysis/glossary-draft${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: glossaryApplyMode, terms: draftTerms }),
      });
      const payload = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) throw new Error(payload.error ?? "应用术语表失败");
      setGlossaryReloadToken((prev) => prev + 1);
      shopify.toast.show(glossaryApplyMode === "replace" ? "已替换术语表" : "已合并到术语表");
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplyingGlossary(false);
    }
  };

  return (
    <div style={isMobile ? mobileLayoutStyle : twoColumnLayoutStyle}>
      <div style={isMobile ? mobileMainStyle : twoColumnMainStyle}>
        <PageSurface>
          <div style={surfaceHeaderStyle}>
            <div style={{ flex: "1 1 auto", minWidth: 0 }}>
              <h3 style={surfaceTitleStyle}>商店档案</h3>
              <p style={surfaceSubtitleStyle}>
                在这里维护行业、语气风格、目标受众和翻译指令。左侧表单展示当前生效的商店档案，可继续手动编辑。
              </p>
            </div>
            <s-button
              type="button"
              variant="secondary"
              onClick={() => void handleTriggerAi()}
              {...(triggering || isRunning ? { disabled: true } : {})}
            >
              {triggering
                ? "生成中…"
                : job && QUEUED_STATUSES.has(job.status)
                  ? "等待 Worker 拉取…"
                  : job && PROCESSING_STATUSES.has(job.status)
                    ? "AI 生成中…"
                    : "使用 AI 生成"}
            </s-button>
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
                      <div style={listFieldHintStyle}>每行输入一个高频词</div>
                    </div>
                    <textarea
                      rows={3}
                      value={profileForm.highFrequencyTerms.join("\n")}
                      onChange={(e) => handleProfileListChange("highFrequencyTerms", e.target.value)}
                      style={listTextareaStyle}
                      placeholder={"品牌名\n核心卖点\n固定活动词"}
                    />
                    {renderLineItems(profileForm.highFrequencyTerms, "当前暂无高频词")}
                  </div>
                  <div style={listFieldCardStyle}>
                    <div style={listFieldHeaderStyle}>
                      <div style={pageFieldLabelStyle}>风格备注</div>
                      <div style={listFieldHintStyle}>每行输入一条风格备注</div>
                    </div>
                    <textarea
                      rows={3}
                      value={profileForm.styleNotes.join("\n")}
                      onChange={(e) => handleProfileListChange("styleNotes", e.target.value)}
                      style={listTextareaStyle}
                      placeholder={"避免直译\n保持品牌调性\n优先使用简洁短句"}
                    />
                    {renderLineItems(profileForm.styleNotes, "当前暂无风格备注")}
                  </div>
                  <div style={fieldBlockStyle}>
                    <div style={pageFieldLabelStyle}>翻译指令</div>
                    <textarea
                      rows={3}
                      value={profileForm.translationInstructions}
                      onChange={(e) =>
                        handleProfileFieldChange("translationInstructions", e.target.value)
                      }
                      style={textareaStyle}
                      placeholder="例如：优先保留品牌表达，不要过度营销化，保持可读性与自然度。"
                    />
                  </div>
                </div>

                {profileError ? <div style={formErrorBoxStyle}>{profileError}</div> : null}

                <div style={footerRowStyle}>
                  <div style={{ ...pageHintTextStyle, marginTop: 0 }}>
                    AI 生成会直接更新正式商店档案；如需继续微调，可将右侧最新结果回填到左侧表单后再保存。
                  </div>
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={() => void handleSaveProfile()}
                    {...(savingProfile ? { disabled: true } : {})}
                  >
                    {savingProfile ? "保存中…" : profileDirty ? "保存商店档案" : "重新保存商店档案"}
                  </s-button>
                </div>
              </>
            )}
          </div>
        </PageSurface>

        <div style={glossaryPanelWrapStyle}>
          <TranslationGlossaryPanel
            locationSearch={locationSearch}
            reloadToken={glossaryReloadToken}
          />
        </div>
      </div>

      <div style={isMobile ? mobileAsideStyle : aiAsideStyle}>
        <PageSurface>
          <div style={surfaceHeaderStyle}>
            <div style={{ flex: "1 1 auto", minWidth: 0 }}>
              <h3 style={surfaceTitleStyle}>AI 生成方案</h3>
              <p style={surfaceSubtitleStyle}>
                右侧展示 AI 最新写入的商店档案结果和术语方案，可回填到左侧表单继续编辑，并应用到术语表。
              </p>
            </div>
            {job ? (
              <span style={statusBadgeStyle(statusTone(job.status))}>{statusLabel(job.status)}</span>
            ) : null}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
            <div style={metaBarStyle}>
              <span>生成源语言：{sourceLocale || profileForm.sourceLanguage || "zh-CN"}</span>
              <span>
                {job?.updatedAt
                  ? `最近更新：${new Date(job.updatedAt).toLocaleString("zh-CN")}`
                  : "尚未生成"}
              </span>
            </div>

            {job ? (
              <div style={pageInnerPanelStyle}>
                <div style={{ fontSize: "0.875rem", fontWeight: 600, color: pageColorTokens.textPrimary }}>
                  {job.status === "FAILED"
                    ? "生成失败，请检查任务状态后重试"
                    : job.status === "COMPLETED"
                      ? "AI 已完成当前方案生成"
                      : "AI 正在扫描并分析商店内容"}
                </div>
                {job.updatedAt && RUNNING_STATUSES.has(job.status) ? (
                  <div style={{ ...pageHintTextStyle, marginTop: "0.4rem" }}>
                    已运行 {formatActualElapsed(job.createdAt, job.updatedAt)}
                  </div>
                ) : null}
                {job.errorMessage ? (
                  <div style={{ ...formErrorBoxStyle, marginTop: "0.65rem" }}>{job.errorMessage}</div>
                ) : null}
              </div>
            ) : null}

            {draftProfile ? (
              <div style={pageInnerPanelStyle}>
                <div style={sectionHeaderRowStyle}>
                  <div>
                    <div style={pageFieldLabelStyle}>当前 AI 写入的商店档案</div>
                    <div style={{ ...pageHintTextStyle, marginTop: 0 }}>
                      {draftProfile.analyzedAt
                        ? `生成时间：${new Date(draftProfile.analyzedAt).toLocaleString("zh-CN")}`
                        : "最新生成结果"}
                    </div>
                  </div>
                  <s-button type="button" variant="primary" onClick={handleApplyDraftProfile}>
                    回填到表单
                  </s-button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                  {draftProfileSummary.map((item) => (
                    <div key={item.label} style={summaryRowStyle}>
                      <span style={summaryLabelStyle}>{item.label}</span>
                      <span style={summaryValueStyle}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {draftTerms.length > 0 ? (
              <div style={pageInnerPanelStyle}>
                <div style={sectionHeaderRowStyle}>
                  <div>
                    <div style={pageFieldLabelStyle}>AI 生成的术语方案</div>
                    <div style={{ ...pageHintTextStyle, marginTop: 0 }}>
                      {draftGeneratedAt
                        ? `生成时间：${new Date(draftGeneratedAt).toLocaleString("zh-CN")}`
                        : `状态：${draftStatus ?? "draft"}`}
                    </div>
                  </div>
                </div>

                <div style={applyModeRowStyle}>
                  <label style={radioLabelStyle}>
                    <input
                      type="radio"
                      name="draft-apply-mode"
                      checked={glossaryApplyMode === "merge"}
                      onChange={() => setGlossaryApplyMode("merge")}
                    />
                    合并到术语表
                  </label>
                  <label style={radioLabelStyle}>
                    <input
                      type="radio"
                      name="draft-apply-mode"
                      checked={glossaryApplyMode === "replace"}
                      onChange={() => setGlossaryApplyMode("replace")}
                    />
                    替换术语表
                  </label>
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={() => void handleApplyGlossary()}
                    {...(applyingGlossary ? { disabled: true } : {})}
                  >
                    {applyingGlossary ? "应用中…" : "应用到术语表"}
                  </s-button>
                </div>

                <div style={termsListStyle}>
                  {draftTerms.map((term, index) => (
                    <div key={`${term.source}-${index}`} style={termRowStyle}>
                      <div style={termHeadStyle}>
                        <span style={termSourceStyle}>{term.source}</span>
                        {term.doNotTranslate ? <span style={dntBadgeStyle}>勿译</span> : null}
                      </div>
                      <div style={termMetaStyle}>
                        {term.doNotTranslate
                          ? "保持原文"
                          : term.translations && Object.keys(term.translations).length
                            ? Object.entries(term.translations)
                                .map(([locale, value]) => `${locale}: ${value}`)
                                .join(" · ")
                            : "待补充固定译法"}
                      </div>
                      {term.note ? <div style={termNoteStyle}>{term.note}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {!draftProfile && draftTerms.length === 0 && !job ? (
              <div style={emptyStateStyle}>
                <div style={{ fontSize: "0.875rem", fontWeight: 600, color: pageColorTokens.textPrimary }}>
                  暂无 AI 生成方案
                </div>
                <div style={{ fontSize: "0.8125rem", color: pageColorTokens.textSecondary, lineHeight: 1.6 }}>
                  点击左侧商店档案卡片中的“使用 AI 生成”，系统会在这里展示推荐的商店档案和术语方案。
                </div>
              </div>
            ) : null}

            {aiError ? <div style={formErrorBoxStyle}>{aiError}</div> : null}
          </div>
        </PageSurface>
      </div>
    </div>
  );
}

const mobileLayoutStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};

const mobileMainStyle: CSSProperties = {
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: "1.25rem",
};

const mobileAsideStyle: CSSProperties = {
  width: "100%",
  maxWidth: "100%",
};

const aiAsideStyle: CSSProperties = {
  ...stickyAsideColumnStyle,
  flex: "1 1 380px",
  maxWidth: 460,
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

const listTextareaStyle: CSSProperties = {
  ...textareaStyle,
  minHeight: "5rem",
  maxHeight: "6.8rem",
  background: "#fcfdfd",
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

const lineItemListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.45rem",
};

const lineItemRowStyle: CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: "10px",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surface,
  fontSize: "0.8125rem",
  lineHeight: 1.5,
  color: pageColorTokens.textPrimary,
};

const lineItemEmptyStyle: CSSProperties = {
  padding: "0.55rem 0.65rem",
  borderRadius: "10px",
  border: `1px dashed ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surfaceMuted,
  fontSize: "0.75rem",
  color: pageColorTokens.textSecondary,
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

const sectionHeaderRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "0.75rem",
  flexWrap: "wrap",
  marginBottom: "0.75rem",
};

function statusBadgeStyle(tone: { color: string; background: string; border: string }): CSSProperties {
  return {
    padding: "0.2rem 0.65rem",
    borderRadius: 999,
    fontSize: "0.75rem",
    fontWeight: 700,
    color: tone.color,
    background: tone.background,
    border: `1px solid ${tone.border}`,
  };
}

const summaryRowStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.2rem",
  paddingBottom: "0.55rem",
  borderBottom: `1px solid ${pageColorTokens.borderSubtle}`,
};

const summaryLabelStyle: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 600,
  color: pageColorTokens.textSecondary,
};

const summaryValueStyle: CSSProperties = {
  fontSize: "0.8125rem",
  color: pageColorTokens.textPrimary,
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const applyModeRowStyle: CSSProperties = {
  display: "flex",
  gap: "0.75rem",
  flexWrap: "wrap",
  alignItems: "center",
  marginBottom: "0.75rem",
};

const radioLabelStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.3rem",
  fontSize: "0.8125rem",
  color: pageColorTokens.textSecondary,
  cursor: "pointer",
  userSelect: "none",
};

const termsListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.55rem",
  maxHeight: 420,
  overflowY: "auto",
};

const termRowStyle: CSSProperties = {
  padding: "0.65rem 0.7rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surface,
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
};

const termHeadStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.45rem",
  flexWrap: "wrap",
};

const termSourceStyle: CSSProperties = {
  fontSize: "0.8125rem",
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const termMetaStyle: CSSProperties = {
  fontSize: "0.75rem",
  color: pageColorTokens.textSecondary,
  lineHeight: 1.5,
};

const termNoteStyle: CSSProperties = {
  fontSize: "0.75rem",
  color: pageColorTokens.textBody,
};

const dntBadgeStyle: CSSProperties = {
  padding: "0.1rem 0.4rem",
  borderRadius: 999,
  fontSize: "0.7rem",
  fontWeight: 700,
  color: pageColorTokens.criticalText,
  background: "#fff0ee",
  border: "1px solid #f3cbc5",
};

const emptyStateStyle: CSSProperties = {
  ...pageInnerPanelStyle,
  display: "flex",
  flexDirection: "column",
  gap: "0.45rem",
  borderStyle: "dashed",
};
