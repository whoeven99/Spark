import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { ShopAnalysisJob, ShopProfile } from "../../../server/translation/shopAnalysis.server";
import type { GlossaryTerm } from "../../../server/translation/glossary.server";
import { TranslationModuleMultiSelect } from "./TranslationModuleMultiSelect";
import {
  PageSurface,
  formErrorBoxStyle,
  pageColorTokens,
  pageFieldLabelStyle,
  pageHintTextStyle,
  pageInnerPanelStyle,
} from "../../page/pageUiStyles";

type ShopAnalysisPanelProps = {
  locationSearch: string;
};

const RUNNING_STATUSES = new Set(["SCAN_QUEUED", "SCANNING", "ANALYZE_QUEUED", "ANALYZING"]);

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
    .map(([loc, val]) => `${loc}: ${val}`)
    .join(" · ");
}

export function ShopAnalysisPanel({ locationSearch }: ShopAnalysisPanelProps) {
  const shopify = useAppBridge();
  const [expanded, setExpanded] = useState(false);

  // Trigger state
  const [sourceLanguage, setSourceLanguage] = useState("zh-CN");
  const [selectedModules, setSelectedModules] = useState<string[]>([...SHOP_ANALYSIS_MODULES]);
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

  const [error, setError] = useState<string | null>(null);

  const isRunning = Boolean(job && RUNNING_STATUSES.has(job.status));

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
      }
    } catch { /* ignore */ }
  }, [locationSearch]);

  // Initial load when panel opens
  useEffect(() => {
    if (!expanded) return;
    void loadJob();
    void loadProfile();
    void loadDraft();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

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

  const handleTrigger = async () => {
    setError(null);
    setTriggering(true);
    try {
      const res = await fetch(`/api/translate/v4/shop-analysis${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceLanguage, modules: selectedModules }),
      });
      const payload = (await res.json()) as { ok: boolean; job?: ShopAnalysisJob; error?: string };
      if (!res.ok || !payload.ok) {
        setError(payload.error ?? "启动失败");
        return;
      }
      setJob(payload.job ?? null);
      shopify.toast.show("商店扫描分析已启动");
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
      shopify.toast.show("商店档案已保存，下次翻译时生效");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleApproveDraft = async () => {
    setApprovingDraft(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/translate/v4/shop-analysis/glossary-draft${locationSearch}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: approveMode }),
        },
      );
      const payload = (await res.json()) as { ok: boolean; total?: number; mode?: string; error?: string };
      if (!res.ok || !payload.ok) { setError(payload.error ?? "操作失败"); return; }
      setDraftTerms([]);
      shopify.toast.show(
        `已将 ${payload.total ?? 0} 条术语${payload.mode === "replace" ? "替换" : "合并"}到术语表`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApprovingDraft(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const headerCount = job
    ? ` · ${statusLabel(job.status)}`
    : jobLoaded
      ? " · 暂未运行"
      : "";

  return (
    <PageSurface>
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          marginBottom: expanded ? "1.25rem" : 0,
        }}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={headerToggleStyle}
        >
          <span style={{ fontSize: "0.75rem", color: pageColorTokens.textSecondary }}>
            {expanded ? "▼" : "▶"}
          </span>
          商店扫描分析
          <span style={{ fontWeight: 500, fontSize: "0.8125rem", color: pageColorTokens.textSecondary }}>
            {headerCount}
          </span>
        </button>

        {job && (
          <span
            style={{
              padding: "0.18rem 0.65rem",
              borderRadius: 999,
              fontSize: "0.75rem",
              fontWeight: 700,
              color: statusColor(job.status),
              background: statusBg(job.status),
              border: `1px solid ${statusColor(job.status)}33`,
            }}
          >
            {statusLabel(job.status)}
          </span>
        )}
      </div>

      {!expanded ? null : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

          {/* ── 触发区域 ─────────────────────────────────────────── */}
          <div style={pageInnerPanelStyle}>
            <div style={pageFieldLabelStyle}>扫描并分析商店内容</div>
            <div style={{ ...pageHintTextStyle, marginTop: 0, marginBottom: "0.85rem" }}>
              扫描源语言内容，AI 自动生成商店档案（行业、风格、高频词）和术语表草稿，
              审核确认后注入每次翻译的 System Prompt。
            </div>

            {/* Source language */}
            <div style={{ marginBottom: "0.75rem" }}>
              <div style={pageFieldLabelStyle}>源语言</div>
              <select
                value={sourceLanguage}
                onChange={(e) => setSourceLanguage(e.target.value)}
                style={selectStyle}
                disabled={isRunning || triggering}
              >
                {SOURCE_LANGS.map((l) => (
                  <option key={l.value} value={l.value}>{l.label} ({l.value})</option>
                ))}
              </select>
            </div>

            {/* Modules */}
            <div style={{ marginBottom: "0.85rem" }}>
              <TranslationModuleMultiSelect
                id="shop-analysis-modules"
                label="扫描模块"
                values={selectedModules}
                onChange={setSelectedModules}
                disabled={isRunning || triggering}
                allowedValues={[...SHOP_ANALYSIS_MODULES]}
              />
            </div>

            <s-button
              type="button"
              variant="primary"
              onClick={() => void handleTrigger()}
              {...(isRunning || triggering || selectedModules.length === 0
                ? { disabled: true }
                : {})}
            >
              {triggering ? "启动中…" : isRunning ? "分析中…" : "扫描并分析"}
            </s-button>
          </div>

          {/* ── 任务状态 ─────────────────────────────────────────── */}
          {job && (
            <div style={{ ...pageInnerPanelStyle, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ ...pageFieldLabelStyle, marginBottom: 0 }}>任务状态</span>
                <span
                  style={{
                    padding: "0.15rem 0.55rem",
                    borderRadius: 999,
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: statusColor(job.status),
                    background: statusBg(job.status),
                    border: `1px solid ${statusColor(job.status)}33`,
                  }}
                >
                  {statusLabel(job.status)}
                </span>
              </div>
              {(isRunning || job.status === "COMPLETED") && (
                <div style={{ fontSize: "0.8125rem", color: pageColorTokens.textSecondary }}>
                  扫描模块 {job.metrics.scannedModules} 个 ·
                  资源 {job.metrics.scannedResources} 条 ·
                  分析批次 {job.metrics.analyzedChunks} 次 ·
                  词条草稿 {job.metrics.glossaryDraftCount} 条
                </div>
              )}
              {isRunning && (
                <div style={progressTrackStyle}>
                  <div style={{ ...progressFillStyle, width: resolveProgressWidth(job) }} />
                </div>
              )}
              {job.status === "FAILED" && job.errorMessage && (
                <div style={errorBoxStyle}>{job.errorMessage}</div>
              )}
              <div style={{ fontSize: "0.75rem", color: pageColorTokens.textSecondary }}>
                触发时间：{new Date(job.createdAt).toLocaleString("zh-CN")} ·
                更新：{new Date(job.updatedAt).toLocaleString("zh-CN")}
              </div>
            </div>
          )}

          {/* ── 商店档案 ─────────────────────────────────────────── */}
          {profile && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                <div style={pageFieldLabelStyle}>商店档案</div>
                {!editingProfile && (
                  <s-button
                    type="button"
                    variant="secondary"
                    onClick={() => { setProfileDraft({ ...profile }); setEditingProfile(true); }}
                  >
                    编辑
                  </s-button>
                )}
              </div>
              <div style={{ ...pageHintTextStyle, marginTop: 0 }}>
                分析时间：{new Date(profile.analyzedAt).toLocaleString("zh-CN")}
                {" · "}已注入每次翻译的 System Prompt
              </div>

              {editingProfile && profileDraft ? (
                <div style={{ ...pageInnerPanelStyle, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {(
                    [
                      { field: "industry" as const, label: "行业", multiline: false },
                      { field: "toneOfVoice" as const, label: "语气风格", multiline: false },
                      { field: "targetAudience" as const, label: "目标受众", multiline: false },
                    ] as const
                  ).map(({ field, label }) => (
                    <div key={field}>
                      <div style={pageFieldLabelStyle}>{label}</div>
                      <input
                        type="text"
                        value={profileDraft[field]}
                        onChange={(e) => setProfileDraft({ ...profileDraft, [field]: e.target.value })}
                        style={inputStyle}
                      />
                    </div>
                  ))}
                  <div>
                    <div style={pageFieldLabelStyle}>高频词（每行一个）</div>
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
                  <div>
                    <div style={pageFieldLabelStyle}>风格备注（每行一条）</div>
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
                  <div>
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
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <s-button
                      type="button"
                      variant="primary"
                      onClick={() => void handleSaveProfile()}
                      {...(savingProfile ? { disabled: true } : {})}
                    >
                      {savingProfile ? "保存中…" : "保存"}
                    </s-button>
                    <s-button type="button" variant="secondary" onClick={() => setEditingProfile(false)}>
                      取消
                    </s-button>
                  </div>
                </div>
              ) : (
                <div style={pageInnerPanelStyle}>
                  <ProfileRow label="行业" value={profile.industry} />
                  <ProfileRow label="语气风格" value={profile.toneOfVoice} />
                  <ProfileRow label="目标受众" value={profile.targetAudience} />
                  {profile.highFrequencyTerms.length > 0 && (
                    <div style={profileRowStyle}>
                      <span style={profileLabelStyle}>高频词</span>
                      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                        {profile.highFrequencyTerms.map((t) => (
                          <span key={t} style={tagStyle}>{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {profile.styleNotes.length > 0 && (
                    <div style={profileRowStyle}>
                      <span style={profileLabelStyle}>风格备注</span>
                      <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                        {profile.styleNotes.map((n, i) => (
                          <li key={i} style={{ fontSize: "0.8125rem", color: pageColorTokens.textBody }}>
                            {n}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {profile.translationInstructions && (
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
                        {profile.translationInstructions}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── 术语草稿 ─────────────────────────────────────────── */}
          {draftTerms.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <div style={pageFieldLabelStyle}>
                  术语表草稿（{draftTerms.length} 条，待确认）
                </div>
                {draftStatus && (
                  <span style={{ ...pageHintTextStyle, marginTop: 0 }}>
                    状态：{draftStatus}
                  </span>
                )}
              </div>
              <div style={{ ...pageHintTextStyle, marginTop: 0 }}>
                草稿不会自动生效，需要你确认后才会写入术语表并在翻译中使用。
              </div>

              {/* approve controls */}
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

              {/* preview table */}
              <div
                style={{
                  ...pageInnerPanelStyle,
                  maxHeight: "380px",
                  overflowY: "auto",
                  padding: "0.75rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.4rem",
                }}
              >
                {draftTerms.map((term, idx) => (
                  <div key={idx} style={draftTermRowStyle}>
                    <span style={draftTermSourceStyle}>{term.source}</span>
                    {term.doNotTranslate && (
                      <span style={dntBadgeStyle}>勿译</span>
                    )}
                    <span style={{ fontSize: "0.75rem", color: pageColorTokens.textSecondary, flex: 1 }}>
                      {formatTranslationsSummary(term.translations)}
                    </span>
                    {term.note && (
                      <span style={{ fontSize: "0.7rem", color: pageColorTokens.textFootnote }}>
                        {term.note}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <div style={formErrorBoxStyle}>{error}</div>}
        </div>
      )}
    </PageSurface>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ProfileRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div style={profileRowStyle}>
      <span style={profileLabelStyle}>{label}</span>
      <span style={{ fontSize: "0.8125rem", color: pageColorTokens.textBody }}>{value}</span>
    </div>
  );
}

function resolveProgressWidth(job: ShopAnalysisJob): string {
  if (job.status === "SCAN_QUEUED") return "5%";
  if (job.status === "SCANNING") {
    const pct = job.metrics.scannedResources
      ? Math.min(48, Math.round((job.metrics.scannedModules / Math.max(job.modules.length, 1)) * 48))
      : 8;
    return `${pct}%`;
  }
  if (job.status === "ANALYZE_QUEUED") return "50%";
  if (job.status === "ANALYZING") {
    const analyzed = job.metrics.analyzedChunks;
    const total = Math.ceil(job.metrics.scannedResources / 15) || 1;
    const pct = 50 + Math.min(49, Math.round((analyzed / total) * 49));
    return `${pct}%`;
  }
  return "99%";
}

// ── Styles ────────────────────────────────────────────────────────────────────

const headerToggleStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  font: "inherit",
  fontWeight: 700,
  fontSize: "1rem",
  color: pageColorTokens.textPrimary,
};

const selectStyle: CSSProperties = {
  marginTop: "0.35rem",
  padding: "0.45rem 0.65rem",
  fontSize: "0.875rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.borderInput}`,
  background: pageColorTokens.surface,
  color: pageColorTokens.textBody,
  width: "100%",
  maxWidth: "260px",
  boxSizing: "border-box",
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
