import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import type {
  ShopAnalysisJob,
  ShopAnalysisTarget,
  ShopProfile,
} from "../../../server/translation/shopAnalysis.server";
import type { GlossaryTerm } from "../../../server/translation/glossary.server";
import {
  PageSurface,
  formErrorBoxStyle,
  pageColorTokens,
  pageFieldLabelStyle,
  pageHintTextStyle,
  pageInnerPanelStyle,
} from "../../page/pageUiStyles";
import { formatActualElapsed } from "../aiTask/AITaskCardShell";

/** 与 worker ANALYSIS_BATCH_SIZE 默认一致，用于 UI 估算分析批次数 */
const ANALYSIS_BATCH_SIZE = 15;

type ShopAnalysisPanelProps = {
  locationSearch: string;
  defaultSourceLanguage: string;
  target: Exclude<ShopAnalysisTarget, "both">;
  onApplied?: () => void;
};

const RUNNING_STATUSES = new Set(["SCAN_QUEUED", "SCANNING", "ANALYZE_QUEUED", "ANALYZING"]);
const QUEUED_STATUSES = new Set(["SCAN_QUEUED", "ANALYZE_QUEUED"]);
const PROCESSING_STATUSES = new Set(["SCANNING", "ANALYZING"]);

const SHOP_ANALYSIS_MODULES = ["PRODUCT", "COLLECTION", "ARTICLE", "BLOG", "PAGE", "SHOP"] as const;

const SOURCE_LANGS = [
  { value: "zh-CN", label: "中文简体" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
];

function statusLabel(s: string): string {
  switch (s) {
    case "SCAN_QUEUED":   return "等待扫描";
    case "SCANNING":      return "扫描中";
    case "ANALYZE_QUEUED": return "等待分析";
    case "ANALYZING":     return "分析中";
    case "COMPLETED":     return "已完成";
    case "FAILED":        return "失败";
    default: return s;
  }
}

function statusColor(s: string): string {
  if (s === "COMPLETED") return pageColorTokens.brandGreenDark;
  if (s === "FAILED") return pageColorTokens.criticalText;
  if (RUNNING_STATUSES.has(s)) return "#8a420f";
  return pageColorTokens.textSecondary;
}

function statusBg(s: string): string {
  if (s === "COMPLETED") return pageColorTokens.brandGreenLight;
  if (s === "FAILED") return "#fff0ee";
  if (RUNNING_STATUSES.has(s)) return "#fff1e8";
  return pageColorTokens.surfaceMuted;
}

function formatTranslationsSummary(translations?: Record<string, string>): string {
  if (!translations || !Object.keys(translations).length) return "—";
  return Object.entries(translations)
    .map(([loc, val]) => `${loc} → ${val}`)
    .join(" · ");
}

function formatDraftTermPreview(term: GlossaryTerm): string {
  if (term.doNotTranslate) return "勿译（保持原文）";
  const trans = formatTranslationsSummary(term.translations);
  if (trans !== "—") return trans;
  return "待补充各语言译法";
}

function normalizeJobTarget(target?: ShopAnalysisTarget): ShopAnalysisTarget {
  return target === "profile" || target === "glossary" ? target : "both";
}

function jobMatchesTarget(job: ShopAnalysisJob, target: Exclude<ShopAnalysisTarget, "both">): boolean {
  const jobTarget = normalizeJobTarget(job.target);
  return jobTarget === "both" || jobTarget === target;
}

function targetLabel(target: Exclude<ShopAnalysisTarget, "both">): string {
  return target === "profile" ? "商店档案" : "术语表";
}

function targetTitle(target: Exclude<ShopAnalysisTarget, "both">): string {
  return target === "profile" ? "商店档案 AI 建议" : "术语表 AI 建议";
}

function targetSubtitle(target: Exclude<ShopAnalysisTarget, "both">): string {
  return target === "profile"
    ? "基于店铺内容生成商店档案建议，确认后再应用到正式配置。"
    : "基于店铺内容生成术语表建议，确认后再应用到正式配置。";
}

function targetIntro(target: Exclude<ShopAnalysisTarget, "both">, sourceLanguage: string): string {
  return target === "profile"
    ? `AI 会基于当前源语言 ${sourceLanguage} 扫描商品、集合、博客、页面和商店信息，生成可编辑的商店档案建议。`
    : `AI 会基于当前源语言 ${sourceLanguage} 扫描商品、集合、博客、页面和商店信息，生成可编辑的术语表建议。`;
}

export function ShopAnalysisPanel({
  locationSearch,
  defaultSourceLanguage,
  target,
  onApplied,
}: ShopAnalysisPanelProps) {
  const shopify = useAppBridge();
  const isProfileTarget = target === "profile";

  // Trigger state
  const [sourceLanguage, setSourceLanguage] = useState(defaultSourceLanguage || "zh-CN");
  const [triggering, setTriggering] = useState(false);

  // Job state
  const [job, setJob] = useState<ShopAnalysisJob | null>(null);
  const [jobLoaded, setJobLoaded] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Profile state
  const [profile, setProfile] = useState<ShopProfile | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState<ShopProfile | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // Draft glossary state
  const [draftTerms, setDraftTerms] = useState<GlossaryTerm[]>([]);
  const [draftStatus, setDraftStatus] = useState<string | null>(null);
  const [approveMode, setApproveMode] = useState<"merge" | "replace">("merge");
  const [approvingDraft, setApprovingDraft] = useState(false);
  const [editingDraftIdx, setEditingDraftIdx] = useState<number | null>(null);
  const [localeRows, setLocaleRows] = useState<Array<{ locale: string; value: string }>>([]);

  const [error, setError] = useState<string | null>(null);

  const relevantJob = job && jobMatchesTarget(job, target) ? job : null;
  const isRunning = Boolean(job && RUNNING_STATUSES.has(job.status));
  const relevantJobRunning = Boolean(relevantJob && RUNNING_STATUSES.has(relevantJob.status));
  const hasProfile = Boolean(profile);

  useEffect(() => {
    setSourceLanguage(defaultSourceLanguage || "zh-CN");
  }, [defaultSourceLanguage]);

  const loadJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/translate/v4/shop-analysis${locationSearch}`);
      const payload = (await res.json()) as { ok: boolean; job?: ShopAnalysisJob | null };
      if (payload.ok) setJob(payload.job ?? null);
      setJobLoaded(true);
    } catch { /* ignore */ }
  }, [locationSearch]);

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch(`/api/translate/v4/shop-analysis/profile${locationSearch}`);
      const payload = (await res.json()) as { ok: boolean; profile?: ShopProfile | null };
      if (payload.ok) setProfile(payload.profile ?? null);
    } catch { /* ignore */ }
  }, [locationSearch]);

  const loadDraft = useCallback(async () => {
    try {
      const res = await fetch(`/api/translate/v4/shop-analysis/glossary-draft${locationSearch}`);
      const payload = (await res.json()) as {
        ok: boolean;
        terms?: GlossaryTerm[];
        status?: string | null;
      };
      if (payload.ok) {
        setDraftTerms(payload.terms ?? []);
        setDraftStatus(payload.status ?? null);
        setEditingDraftIdx(null);
      }
    } catch { /* ignore */ }
  }, [locationSearch]);

  useEffect(() => {
    void loadJob();
    void loadProfile();
    void loadDraft();
  }, [loadDraft, loadJob, loadProfile]);

  // Poll while running
  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (isRunning) {
      pollingRef.current = setInterval(() => void loadJob(), 5_000);
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [isRunning, loadJob]);

  // Reload profile+draft when job completes
  const prevStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (job?.status === "COMPLETED" && prevStatusRef.current !== "COMPLETED") {
      void loadProfile();
      void loadDraft();
    }
    prevStatusRef.current = job?.status;
  }, [job?.status, loadProfile, loadDraft]);

  useEffect(() => {
    if (!isProfileTarget) return;
    if (!profile) {
      setProfileDraft(null);
      setEditingProfile(false);
      return;
    }
    setProfileDraft({ ...profile });
    setEditingProfile(true);
  }, [isProfileTarget, profile]);

  const handleTrigger = async () => {
    setError(null);
    setTriggering(true);
    try {
      const res = await fetch(`/api/translate/v4/shop-analysis${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceLanguage, modules: [...SHOP_ANALYSIS_MODULES], target }),
      });
      const payload = (await res.json()) as { ok: boolean; job?: ShopAnalysisJob; error?: string };
      if (!res.ok || !payload.ok) {
        setError(payload.error ?? "启动失败");
        return;
      }
      setJob(payload.job ?? null);
      shopify.toast.show(`已开始生成${targetLabel(target)}建议`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTriggering(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!profileDraft) return;
    setSavingProfile(true);
    setError(null);
    try {
      const res = await fetch(`/api/translate/v4/shop-analysis/profile${locationSearch}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileDraft),
      });
      const payload = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !payload.ok) { setError(payload.error ?? "保存失败"); return; }
      setProfile(profileDraft);
      setEditingProfile(false);
      onApplied?.();
      shopify.toast.show("建议已保存到商店档案，下次翻译时生效");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleApproveDraft = async () => {
    const invalid = draftTerms.some((t) => !t.source.trim());
    if (invalid) {
      setError("请填写每条术语的原文，或从草稿中删除空行");
      return;
    }
    setApprovingDraft(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/translate/v4/shop-analysis/glossary-draft${locationSearch}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: approveMode, terms: draftTerms }),
        },
      );
      const payload = (await res.json()) as { ok: boolean; total?: number; mode?: string; error?: string };
      if (!res.ok || !payload.ok) { setError(payload.error ?? "操作失败"); return; }
      setDraftTerms([]);
      onApplied?.();
      shopify.toast.show(
        `已将 ${payload.total ?? 0} 条术语${payload.mode === "replace" ? "替换" : "合并"}到术语表`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApprovingDraft(false);
    }
  };

  const updateDraftTerm = (idx: number, patch: Partial<GlossaryTerm>) => {
    setDraftTerms((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };

  const removeDraftTerm = (idx: number) => {
    setDraftTerms((prev) => prev.filter((_, i) => i !== idx));
    if (editingDraftIdx === idx) setEditingDraftIdx(null);
    else if (editingDraftIdx !== null && editingDraftIdx > idx) {
      setEditingDraftIdx(editingDraftIdx - 1);
    }
  };

  const openDraftDetail = (idx: number) => {
    if (editingDraftIdx === idx) {
      setEditingDraftIdx(null);
      return;
    }
    const term = draftTerms[idx];
    const entries = Object.entries(term.translations ?? {});
    setLocaleRows(
      entries.length
        ? entries.map(([locale, value]) => ({ locale, value }))
        : [{ locale: "", value: "" }],
    );
    setEditingDraftIdx(idx);
  };

  const saveDraftTranslations = () => {
    if (editingDraftIdx === null) return;
    const result: Record<string, string> = {};
    for (const row of localeRows) {
      const k = row.locale.trim().toLowerCase();
      const v = row.value.trim();
      if (k && v) result[k] = v;
    }
    updateDraftTerm(editingDraftIdx, {
      translations: Object.keys(result).length ? result : undefined,
    });
    setEditingDraftIdx(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <PageSurface {...(isProfileTarget ? {} : { title: targetTitle(target), subtitle: targetSubtitle(target) })}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div style={isProfileTarget ? compactActionRowStyle : actionRowStyle}>
          {!isProfileTarget ? (
            <div style={{ ...pageHintTextStyle, marginTop: 0 }}>
              {targetIntro(target, sourceLanguage)}
            </div>
          ) : null}
          <s-button
            type="button"
            variant="secondary"
            onClick={() => void handleTrigger()}
            {...(isRunning || triggering ? { disabled: true } : {})}
          >
            {triggering
              ? "生成中…"
              : relevantJob && QUEUED_STATUSES.has(relevantJob.status)
                ? "等待 Worker 拉取…"
                : relevantJob && PROCESSING_STATUSES.has(relevantJob.status)
                  ? "建议生成中…"
                  : "生成建议"}
          </s-button>
        </div>

        {isRunning && !relevantJob ? (
          <div style={{ ...pageHintTextStyle, marginTop: 0 }}>
            当前有其他 AI 建议任务正在运行，需等待完成后再发起本卡片的建议生成。
          </div>
        ) : null}

        {relevantJob && !isProfileTarget ? (
          <span
            style={{
              alignSelf: "flex-start",
              padding: "0.18rem 0.65rem",
              borderRadius: 999,
              fontSize: "0.75rem",
              fontWeight: 700,
              color: statusColor(relevantJob.status),
              background: statusBg(relevantJob.status),
              border: `1px solid ${statusColor(relevantJob.status)}33`,
            }}
          >
            {statusLabel(relevantJob.status)}
          </span>
        )}

          {/* ── 任务状态 ─────────────────────────────────────────── */}
          {relevantJob && !isProfileTarget ? (
            <div style={{ ...pageInnerPanelStyle, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ ...pageFieldLabelStyle, marginBottom: 0 }}>任务状态</span>
                <span
                  style={{
                    padding: "0.15rem 0.55rem",
                    borderRadius: 999,
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: statusColor(relevantJob.status),
                    background: statusBg(relevantJob.status),
                    border: `1px solid ${statusColor(relevantJob.status)}33`,
                  }}
                >
                  {statusLabel(relevantJob.status)}
                </span>
              </div>
              {(relevantJobRunning || relevantJob.status === "COMPLETED") && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: "0.875rem", fontWeight: 600, color: pageColorTokens.textPrimary }}>
                    {getAnalysisPrimaryCopy(relevantJob, target)}
                  </div>
                  {relevantJobRunning && relevantJob.updatedAt ? (
                    <div style={{ fontSize: "0.75rem", color: pageColorTokens.textSecondary }}>
                      已运行 {formatActualElapsed(relevantJob.createdAt, relevantJob.updatedAt)}
                    </div>
                  ) : null}
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {(() => {
                      const steps = getAnalysisSteps(relevantJob);
                      return (
                        <>
                          <AnalysisStepRow
                            step={1}
                            title="扫描商店内容"
                            state={steps.scanState}
                            caption={steps.scanCaption}
                            progressPercent={steps.scanProgress}
                          />
                          <AnalysisStepRow
                            step={2}
                            title="AI 分析"
                            state={steps.analyzeState}
                            caption={steps.analyzeCaption}
                            progressPercent={steps.analyzeProgress}
                          />
                        </>
                      );
                    })()}
                  </div>
                  {relevantJobRunning ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "0.7rem",
                          color: pageColorTokens.textFootnote,
                        }}
                      >
                        <span>总进度</span>
                        <span>{getAnalysisProgressPercent(relevantJob)}%</span>
                      </div>
                      <div style={progressTrackStyle}>
                        <div
                          style={{
                            ...progressFillStyle,
                            width: `${getAnalysisProgressPercent(relevantJob)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
              {relevantJob.status === "FAILED" && relevantJob.errorMessage && (
                <div style={errorBoxStyle}>{relevantJob.errorMessage}</div>
              )}
              <div style={{ fontSize: "0.75rem", color: pageColorTokens.textSecondary }}>
                触发时间：{new Date(relevantJob.createdAt).toLocaleString("zh-CN")} ·
                更新：{new Date(relevantJob.updatedAt).toLocaleString("zh-CN")}
              </div>
            </div>
          )}

          {/* ── 商店档案 ─────────────────────────────────────────── */}
          {target !== "glossary" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
            {!isProfileTarget ? (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                  <div style={pageFieldLabelStyle}>档案内容</div>
                  {hasProfile && !editingProfile ? (
                    <s-button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setProfileDraft(profile ? { ...profile } : null);
                        setEditingProfile(true);
                      }}
                    >
                      编辑
                    </s-button>
                  ) : null}
                </div>
                {hasProfile ? (
                  <div style={{ ...pageHintTextStyle, marginTop: 0 }}>
                    分析时间：{new Date(profile!.analyzedAt).toLocaleString("zh-CN")}
                    {" · "}已注入每次翻译的 System Prompt
                  </div>
                ) : (
                  <div style={{ ...pageHintTextStyle, marginTop: 0 }}>
                    暂无商店档案。可点击右上角「生成建议」先生成一份初稿，再按需手动编辑。
                  </div>
                )}
              </>
            ) : null}

            {editingProfile && profileDraft ? (
              <div style={isProfileTarget ? aiProfileEditorStyle : { ...pageInnerPanelStyle, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {(
                  [
                    { field: "industry" as const, label: "行业", multiline: false },
                    { field: "toneOfVoice" as const, label: "语气风格", multiline: false },
                    { field: "targetAudience" as const, label: "目标受众", multiline: false },
                  ] as const
                ).map(({ field, label }) => (
                  <div key={field} style={fieldStackStyle}>
                    <div style={pageFieldLabelStyle}>{label}</div>
                    <input
                      type="text"
                      value={profileDraft[field]}
                      onChange={(e) => setProfileDraft({ ...profileDraft, [field]: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                ))}
                <div style={aiListCardStyle}>
                  <div style={pageFieldLabelStyle}>高频词（每行一个）</div>
                  {profileDraft.highFrequencyTerms.length > 0 ? (
                    <div style={aiChipWrapStyle}>
                      {profileDraft.highFrequencyTerms.map((term, index) => (
                        <span key={`${term}-${index}`} style={aiChipStyle}>{term}</span>
                      ))}
                    </div>
                  ) : null}
                  <textarea
                    rows={3}
                    value={profileDraft.highFrequencyTerms.join("\n")}
                    onChange={(e) =>
                      setProfileDraft({
                        ...profileDraft,
                        highFrequencyTerms: e.target.value.split("\n").filter(Boolean),
                      })
                    }
                    style={textareaStyle}
                  />
                </div>
                <div style={aiListCardStyle}>
                  <div style={pageFieldLabelStyle}>风格备注（每行一条）</div>
                  {profileDraft.styleNotes.length > 0 ? (
                    <div style={aiChipWrapStyle}>
                      {profileDraft.styleNotes.map((note, index) => (
                        <span key={`${note}-${index}`} style={aiChipStyle}>{note}</span>
                      ))}
                    </div>
                  ) : null}
                  <textarea
                    rows={3}
                    value={profileDraft.styleNotes.join("\n")}
                    onChange={(e) =>
                      setProfileDraft({
                        ...profileDraft,
                        styleNotes: e.target.value.split("\n").filter(Boolean),
                      })
                    }
                    style={textareaStyle}
                  />
                </div>
                <div style={fieldStackStyle}>
                  <div style={pageFieldLabelStyle}>翻译指令（注入系统 Prompt）</div>
                  <textarea
                    rows={4}
                    value={profileDraft.translationInstructions}
                    onChange={(e) =>
                      setProfileDraft({ ...profileDraft, translationInstructions: e.target.value })
                    }
                    style={textareaStyle}
                  />
                </div>
                <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={() => void handleSaveProfile()}
                    {...(savingProfile ? { disabled: true } : {})}
                  >
                    {savingProfile ? "保存中…" : "保存"}
                  </s-button>
                  {!isProfileTarget ? (
                    <s-button type="button" variant="secondary" onClick={() => setEditingProfile(false)}>
                      取消
                    </s-button>
                  ) : null}
                </div>
              </div>
            ) : hasProfile ? (
              <div style={pageInnerPanelStyle}>
                <ProfileRow label="行业" value={profile!.industry} />
                <ProfileRow label="语气风格" value={profile!.toneOfVoice} />
                <ProfileRow label="目标受众" value={profile!.targetAudience} />
                {profile!.highFrequencyTerms.length > 0 && (
                  <div style={profileRowStyle}>
                    <span style={profileLabelStyle}>高频词</span>
                    <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                      {profile!.highFrequencyTerms.map((t) => (
                        <span key={t} style={tagStyle}>{t}</span>
                      ))}
                    </div>
                  </div>
                )}
                {profile!.styleNotes.length > 0 && (
                  <div style={profileRowStyle}>
                    <span style={profileLabelStyle}>风格备注</span>
                    <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                      {profile!.styleNotes.map((n, i) => (
                        <li key={i} style={{ fontSize: "0.8125rem", color: pageColorTokens.textBody }}>
                          {n}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {profile!.translationInstructions && (
                  <div style={profileRowStyle}>
                    <span style={profileLabelStyle}>翻译指令</span>
                    <pre
                      style={{
                        margin: 0,
                        fontSize: "0.75rem",
                        color: pageColorTokens.textBody,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        fontFamily: "inherit",
                      }}
                    >
                      {profile!.translationInstructions}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div style={emptyPromptStyle}>
                <div style={{ fontSize: "0.875rem", fontWeight: 600, color: pageColorTokens.textPrimary }}>
                  还没有可用的商店档案建议
                </div>
                <div style={{ fontSize: "0.8125rem", color: pageColorTokens.textSecondary, lineHeight: 1.6 }}>
                  先让 AI 生成一版行业、语气风格、目标受众和翻译指令建议，再按业务需求做微调。
                </div>
              </div>
            )}
          </div>
          ) : null}

          {/* ── 术语草稿 ─────────────────────────────────────────── */}
          {target !== "profile" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              {draftTerms.length > 0 ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                    <div style={pageFieldLabelStyle}>
                      术语建议（{draftTerms.length} 条，待确认）
                    </div>
                    {draftStatus && (
                      <span style={{ ...pageHintTextStyle, marginTop: 0 }}>
                        状态：{draftStatus}
                      </span>
                    )}
                  </div>
                  <div style={{ ...pageHintTextStyle, marginTop: 0 }}>
                    草稿不会自动生效，需要你确认后才会写入术语表并在翻译中使用。点击「查看详情」可编辑各语言固定译法。
                  </div>

                  <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
                    <label style={radioLabelStyle}>
                      <input
                        type="radio"
                        name="approve-mode"
                        checked={approveMode === "merge"}
                        onChange={() => setApproveMode("merge")}
                      />
                      合并到现有术语表
                    </label>
                    <label style={radioLabelStyle}>
                      <input
                        type="radio"
                        name="approve-mode"
                        checked={approveMode === "replace"}
                        onChange={() => setApproveMode("replace")}
                      />
                      替换现有术语表
                    </label>
                    <s-button
                      type="button"
                      variant="primary"
                      onClick={() => void handleApproveDraft()}
                      {...(approvingDraft ? { disabled: true } : {})}
                    >
                      {approvingDraft ? "写入中…" : `确认生效（${draftTerms.length} 条）`}
                    </s-button>
                  </div>

                  <div
                    style={{
                      ...pageInnerPanelStyle,
                      maxHeight: "480px",
                      overflowY: "auto",
                      padding: "0.75rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                    }}
                  >
                    {draftTerms.map((term, idx) => (
                  <div
                    key={idx}
                    style={{
                      ...draftTermRowStyle,
                      flexDirection: "column",
                      alignItems: "stretch",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        alignItems: "center",
                        flexWrap: "wrap",
                        width: "100%",
                      }}
                    >
                      <span style={draftTermSourceStyle}>{term.source}</span>
                      {term.doNotTranslate && (
                        <span style={dntBadgeStyle}>勿译</span>
                      )}
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: pageColorTokens.textSecondary,
                          flex: "1 1 160px",
                        }}
                      >
                        {formatDraftTermPreview(term)}
                      </span>
                      {term.note && (
                        <span style={draftNoteTagStyle}>{term.note}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => openDraftDetail(idx)}
                        style={linkBtnStyle}
                      >
                        {editingDraftIdx === idx ? "收起" : "查看详情"}
                      </button>
                    </div>

                    {editingDraftIdx === idx && (
                      <div
                        style={{
                          marginTop: "0.55rem",
                          padding: "0.65rem",
                          borderRadius: pageColorTokens.radiusControl,
                          border: `1px solid ${pageColorTokens.borderSubtle}`,
                          background: pageColorTokens.surface,
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.5rem",
                        }}
                      >
                        <div style={pageFieldLabelStyle}>
                          术语详情 · 「{term.source || "…"}」
                        </div>
                        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                          <input
                            type="text"
                            value={term.source}
                            placeholder="原文术语"
                            onChange={(e) => updateDraftTerm(idx, { source: e.target.value })}
                            style={{ ...inputStyle, flex: "1 1 180px", marginTop: 0 }}
                          />
                          <label style={checkboxLabelStyle} title="勾选后所有语言均不翻译">
                            <input
                              type="checkbox"
                              checked={!!term.doNotTranslate}
                              onChange={(e) =>
                                updateDraftTerm(idx, { doNotTranslate: e.target.checked || undefined })
                              }
                            />
                            勿译
                          </label>
                          <input
                            type="text"
                            value={term.note ?? ""}
                            placeholder="分类 / 备注（如 tag、product feature）"
                            onChange={(e) => updateDraftTerm(idx, { note: e.target.value || undefined })}
                            style={{ ...inputStyle, flex: "1 1 200px", marginTop: 0 }}
                          />
                          <button type="button" onClick={() => removeDraftTerm(idx)} style={dangerBtnStyle}>
                            从草稿移除
                          </button>
                        </div>

                        {!term.doNotTranslate && (
                          <>
                            <div style={{ ...pageFieldLabelStyle, marginTop: "0.25rem" }}>
                              各语言固定译法
                            </div>
                            <div style={{ ...pageHintTextStyle, marginTop: 0 }}>
                              语言代码示例：en · zh-CN · ja · fr。翻译时会按此处配置强制使用对应译法。
                            </div>
                            {localeRows.map((row, rowIdx) => (
                              <div
                                key={rowIdx}
                                style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}
                              >
                                <input
                                  type="text"
                                  value={row.locale}
                                  placeholder="语言"
                                  onChange={(e) =>
                                    setLocaleRows((prev) =>
                                      prev.map((r, i) =>
                                        i === rowIdx ? { ...r, locale: e.target.value } : r,
                                      ),
                                    )
                                  }
                                  style={{ ...inputStyle, width: "6rem", marginTop: 0 }}
                                />
                                <input
                                  type="text"
                                  value={row.value}
                                  placeholder="对应翻译"
                                  onChange={(e) =>
                                    setLocaleRows((prev) =>
                                      prev.map((r, i) =>
                                        i === rowIdx ? { ...r, value: e.target.value } : r,
                                      ),
                                    )
                                  }
                                  style={{ ...inputStyle, flex: 1, minWidth: "10rem", marginTop: 0 }}
                                />
                                <button
                                  type="button"
                                  onClick={() => setLocaleRows((prev) => prev.filter((_, i) => i !== rowIdx))}
                                  style={dangerBtnStyle}
                                >
                                  移除
                                </button>
                              </div>
                            ))}
                            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                              <s-button
                                type="button"
                                variant="secondary"
                                onClick={() =>
                                  setLocaleRows((prev) => [...prev, { locale: "", value: "" }])
                                }
                              >
                                添加语言
                              </s-button>
                              <s-button type="button" variant="primary" onClick={saveDraftTranslations}>
                                保存译法
                              </s-button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={emptyPromptStyle}>
                  <div style={{ fontSize: "0.875rem", fontWeight: 600, color: pageColorTokens.textPrimary }}>
                    还没有可用的术语建议
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: pageColorTokens.textSecondary, lineHeight: 1.6 }}>
                    点击上方「生成建议」后，AI 会提取品牌名、固定译法和高频业务词，供你确认后写入术语表。
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {error && <div style={formErrorBoxStyle}>{error}</div>}
      </div>
    </PageSurface>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scanModulesDone(job: ShopAnalysisJob): number {
  if (["ANALYZE_QUEUED", "ANALYZING", "COMPLETED"].includes(job.status)) {
    return job.modules.length;
  }
  return job.metrics.scannedModules;
}

function analysisBatchTotal(job: ShopAnalysisJob): number {
  if (job.metrics.scannedResources <= 0) return 1;
  return Math.max(1, Math.ceil(job.metrics.scannedResources / ANALYSIS_BATCH_SIZE));
}

function getAnalysisPrimaryCopy(
  job: ShopAnalysisJob,
  target: Exclude<ShopAnalysisTarget, "both">,
): string {
  const moduleDone = scanModulesDone(job);
  const moduleTotal = job.modules.length;
  const batchTotal = analysisBatchTotal(job);
  const { status, metrics } = job;
  const targetName = targetLabel(target);

  switch (status) {
    case "SCAN_QUEUED":
      return `${targetName}建议任务已创建，等待 Worker 拉取…`;
    case "SCANNING":
      return `正在为${targetName}扫描模块 ${moduleDone}/${moduleTotal} · 已采集 ${metrics.scannedResources} 条资源`;
    case "ANALYZE_QUEUED":
      return `扫描完成（${moduleTotal} 个模块 · ${metrics.scannedResources} 条资源），等待生成${targetName}建议…`;
    case "ANALYZING":
      return `正在生成${targetName}建议 ${metrics.analyzedChunks}/${batchTotal} 批`;
    case "COMPLETED":
      return target === "profile"
        ? "商店档案建议已生成，可直接检查并保存"
        : `术语建议已生成 · ${metrics.glossaryDraftCount} 条待确认`;
    case "FAILED":
      return `${targetName}建议生成失败`;
    default:
      return statusLabel(status);
  }
}

function getAnalysisProgressPercent(job: ShopAnalysisJob): number {
  if (job.status === "COMPLETED") return 100;
  if (job.status === "FAILED") return 8;
  if (job.status === "SCAN_QUEUED") return 5;

  const scanRatio =
    job.modules.length > 0 ? scanModulesDone(job) / job.modules.length : 0;
  const analyzeRatio = job.metrics.analyzedChunks / analysisBatchTotal(job);

  if (job.status === "SCANNING") {
    return Math.round(Math.max(8, scanRatio * 48));
  }
  if (job.status === "ANALYZE_QUEUED") return 50;
  if (job.status === "ANALYZING") {
    return Math.round(50 + Math.min(49, analyzeRatio * 49));
  }
  return 0;
}

function getAnalysisSteps(job: ShopAnalysisJob): {
  scanState: AnalysisStepState;
  analyzeState: AnalysisStepState;
  scanCaption: string;
  analyzeCaption: string;
  scanProgress: number;
  analyzeProgress: number;
} {
  const moduleTotal = Math.max(1, job.modules.length);
  const moduleDone = scanModulesDone(job);
  const batchTotal = analysisBatchTotal(job);
  const batchDone =
    job.status === "COMPLETED" ? batchTotal : Math.min(batchTotal, job.metrics.analyzedChunks);

  const scanState: AnalysisStepState =
    job.status === "SCAN_QUEUED" ? "pending" : job.status === "SCANNING" ? "active" : "done";

  const analyzeState: AnalysisStepState = ["SCAN_QUEUED", "SCANNING"].includes(job.status)
    ? "pending"
    : job.status === "ANALYZE_QUEUED"
      ? "active"
      : job.status === "ANALYZING"
        ? "active"
        : job.status === "COMPLETED"
          ? "done"
          : "pending";

  const scanCaption =
    job.metrics.scannedResources > 0
      ? `${moduleDone}/${moduleTotal} 模块 · ${job.metrics.scannedResources} 条资源`
      : `${moduleDone}/${moduleTotal} 模块`;

  let analyzeCaption: string;
  if (job.status === "COMPLETED") {
    analyzeCaption =
      job.metrics.glossaryDraftCount > 0
        ? `${batchTotal}/${batchTotal} 批 · ${job.metrics.glossaryDraftCount} 条术语草稿`
        : `${batchTotal}/${batchTotal} 批 · 分析完成`;
  } else if (job.status === "ANALYZE_QUEUED") {
    analyzeCaption = "等待 Worker 开始分析…";
  } else if (job.status === "ANALYZING") {
    analyzeCaption = `${batchDone}/${batchTotal} 批`;
  } else {
    analyzeCaption = "等待扫描完成后开始";
  }

  return {
    scanState,
    analyzeState,
    scanCaption,
    analyzeCaption,
    scanProgress: Math.round((moduleDone / moduleTotal) * 100),
    analyzeProgress: Math.round((batchDone / batchTotal) * 100),
  };
}

type AnalysisStepState = "pending" | "active" | "done";

type AnalysisStepRowProps = {
  step: number;
  title: string;
  state: AnalysisStepState;
  caption: string;
  progressPercent: number;
};

function AnalysisStepRow({ step, title, state, caption, progressPercent }: AnalysisStepRowProps) {
  const iconBg =
    state === "done"
      ? pageColorTokens.brandGreenLight
      : state === "active"
        ? "#fff1e8"
        : pageColorTokens.surfaceMuted;
  const iconColor =
    state === "done"
      ? pageColorTokens.brandGreenDark
      : state === "active"
        ? "#8a420f"
        : pageColorTokens.textFootnote;
  const iconBorder =
    state === "done"
      ? `${pageColorTokens.brandGreen}55`
      : state === "active"
        ? "#c0571755"
        : pageColorTokens.borderSubtle;

  return (
    <div
      style={{
        display: "flex",
        gap: "0.65rem",
        alignItems: "flex-start",
        padding: "0.55rem 0.65rem",
        borderRadius: pageColorTokens.radiusControl,
        border: `1px solid ${pageColorTokens.borderSubtle}`,
        background: state === "active" ? pageColorTokens.surfaceEvenRow : pageColorTokens.surface,
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: state === "done" ? "0.7rem" : "0.68rem",
          fontWeight: 700,
          color: iconColor,
          background: iconBg,
          border: `1px solid ${iconBorder}`,
        }}
        aria-hidden
      >
        {state === "done" ? "✓" : step}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "0.5rem",
            alignItems: "baseline",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: "0.8125rem",
              fontWeight: state === "pending" ? 500 : 600,
              color:
                state === "pending" ? pageColorTokens.textSecondary : pageColorTokens.textPrimary,
            }}
          >
            {title}
          </span>
          <span
            style={{
              fontSize: "0.75rem",
              color: pageColorTokens.textSecondary,
              textAlign: "right",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {caption}
          </span>
        </div>
        {state === "active" ? (
          <div
            style={{
              marginTop: 6,
              height: 6,
              borderRadius: 999,
              background: pageColorTokens.divider,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.max(4, progressPercent)}%`,
                height: "100%",
                background: "#c05717",
                borderRadius: 999,
                transition: "width 0.35s ease",
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div style={profileRowStyle}>
      <span style={profileLabelStyle}>{label}</span>
      <span style={{ fontSize: "0.8125rem", color: pageColorTokens.textBody }}>{value}</span>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const actionRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  flexWrap: "wrap",
};

const compactActionRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
};

const emptyPromptStyle: CSSProperties = {
  ...pageInnerPanelStyle,
  display: "flex",
  flexDirection: "column",
  gap: "0.45rem",
  borderStyle: "dashed",
};

const inputStyle: CSSProperties = {
  width: "100%",
  marginTop: "0.25rem",
  padding: "0.4rem 0.55rem",
  borderRadius: "6px",
  border: `1px solid ${pageColorTokens.borderInput}`,
  fontSize: "0.8125rem",
  color: pageColorTokens.textBody,
  boxSizing: "border-box",
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  fontFamily: "inherit",
};

const checkboxLabelStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.3rem",
  fontSize: "0.8125rem",
  color: pageColorTokens.textSecondary,
  cursor: "pointer",
  userSelect: "none",
};

const radioLabelStyle: CSSProperties = {
  ...checkboxLabelStyle,
};

const progressTrackStyle: CSSProperties = {
  height: 6,
  borderRadius: 999,
  background: pageColorTokens.divider,
  overflow: "hidden",
};

const progressFillStyle: CSSProperties = {
  height: "100%",
  background: "#c05717",
  borderRadius: 999,
  transition: "width 0.6s ease",
};

const errorBoxStyle: CSSProperties = {
  padding: "0.6rem 0.75rem",
  borderRadius: pageColorTokens.radiusControl,
  background: "#fff0ee",
  border: "1px solid #f3cbc5",
  color: pageColorTokens.criticalText,
  fontSize: "0.8125rem",
  lineHeight: 1.5,
  wordBreak: "break-word",
};

const profileRowStyle: CSSProperties = {
  display: "flex",
  gap: "0.75rem",
  padding: "0.4rem 0",
  borderBottom: `1px solid ${pageColorTokens.borderSubtle}`,
  alignItems: "flex-start",
};

const profileLabelStyle: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 600,
  color: pageColorTokens.textSecondary,
  minWidth: "72px",
  flexShrink: 0,
  paddingTop: "0.1rem",
};

const fieldStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
};

const aiProfileEditorStyle: CSSProperties = {
  ...pageInnerPanelStyle,
  display: "flex",
  flexDirection: "column",
  gap: "0.85rem",
  border: "1px solid #0f5c48",
  background: "linear-gradient(180deg, #f4fbf8 0%, #ffffff 100%)",
  boxShadow: "0 10px 28px rgba(15, 92, 72, 0.08)",
};

const aiListCardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.55rem",
  padding: "0.8rem 0.9rem",
  borderRadius: pageColorTokens.radiusControl,
  border: "1px solid #0f5c48",
  background: "#f8fcfa",
};

const aiChipWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.4rem",
};

const aiChipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0.22rem 0.55rem",
  borderRadius: "999px",
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "#0f5c48",
  background: "#ebf7f1",
  border: "1px solid #0f5c48",
};

const tagStyle: CSSProperties = {
  padding: "0.15rem 0.5rem",
  borderRadius: 999,
  fontSize: "0.75rem",
  background: pageColorTokens.brandBlueLight,
  color: pageColorTokens.brandBlueDark,
  border: `1px solid ${pageColorTokens.brandBlue}33`,
};

const draftTermRowStyle: CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  alignItems: "center",
  flexWrap: "wrap",
  padding: "0.4rem 0.5rem",
  borderRadius: "6px",
  background: pageColorTokens.surfaceEvenRow,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
};

const draftTermSourceStyle: CSSProperties = {
  fontWeight: 600,
  fontSize: "0.8125rem",
  color: pageColorTokens.textPrimary,
  minWidth: "80px",
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

const draftNoteTagStyle: CSSProperties = {
  padding: "0.1rem 0.45rem",
  borderRadius: 999,
  fontSize: "0.7rem",
  color: pageColorTokens.textFootnote,
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
};

const linkBtnStyle: CSSProperties = {
  background: "none",
  border: "none",
  padding: "0.2rem 0.35rem",
  fontSize: "0.75rem",
  color: pageColorTokens.brandBlue,
  cursor: "pointer",
  textDecoration: "underline",
  flexShrink: 0,
};

const dangerBtnStyle: CSSProperties = {
  background: "none",
  border: "none",
  padding: "0.2rem 0.35rem",
  fontSize: "0.75rem",
  color: pageColorTokens.criticalText,
  cursor: "pointer",
};
