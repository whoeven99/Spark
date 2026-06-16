import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { GlossaryTerm } from "../../../server/translation/glossary.server";
import { DialogShell } from "../shared/DialogShell";
import {
  PageSurface,
  formErrorBoxStyle,
  pageColorTokens,
  pageFieldLabelStyle,
  pageHintTextStyle,
  pageInnerPanelStyle,
} from "../../page/pageUiStyles";

type TranslationGlossaryPanelProps = {
  locationSearch: string;
  reloadToken?: number;
  onRequestAiSuggestion?: () => void;
  mode?: "summary" | "full-editor";
  onBack?: () => void;
};

type ParsedPreviewRow = GlossaryTerm & { _key: number; _selected: boolean };
type LocaleRow = { locale: string; value: string };
type TermEditDraft = {
  source: string;
  note: string;
  doNotTranslate: boolean;
  localeRows: LocaleRow[];
};

type ParseFeedback = {
  status: "valid" | "invalid";
  message: string;
  fileName: string;
};

const FILE_ACCEPT = ".txt,.md,.csv,.json";
const FILE_TYPES_LABEL = ".txt / .md / .csv / .json";
const GLOSSARY_PAGE_SIZE = 20;

function SaveGlossaryBar({
  saving,
  onSave,
}: {
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div style={saveBarStyle}>
      <span style={{ fontSize: "0.8125rem", color: pageColorTokens.textSecondary }}>
        有未保存的改动，保存后翻译任务才会使用最新术语表
      </span>
      <s-button type="button" variant="primary" onClick={onSave} {...(saving ? { disabled: true } : {})}>
        {saving ? "保存中…" : "保存术语表"}
      </s-button>
    </div>
  );
}

function mergeTermsClient(existing: GlossaryTerm[], imported: GlossaryTerm[]): GlossaryTerm[] {
  const map = new Map(existing.map((t) => [t.source, { ...t }]));
  for (const imp of imported) {
    const ex = map.get(imp.source);
    if (!ex) {
      map.set(imp.source, imp);
      continue;
    }
    if (imp.translations) ex.translations = { ...imp.translations, ...ex.translations };
    if (!ex.note && imp.note) ex.note = imp.note;
    if (!ex.doNotTranslate && imp.doNotTranslate) ex.doNotTranslate = true;
  }
  return [...map.values()];
}

function formatTranslationsSummary(translations?: Record<string, string>): string {
  if (!translations || !Object.keys(translations).length) return "—";
  return Object.values(translations)
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" · ");
}

function countConfiguredLocales(translations?: Record<string, string>): number {
  return Object.keys(translations ?? {}).filter((locale) => locale.trim()).length;
}

function formatEffectiveLocales(term: GlossaryTerm): string {
  if (term.doNotTranslate) return "全部语言";
  const locales = Object.keys(term.translations ?? {}).filter((locale) => locale.trim());
  if (!locales.length) return "未指定";
  return locales.join(" / ");
}

function getRuleDescription(doNotTranslate?: boolean): string {
  return doNotTranslate ? "保持原文，不参与翻译" : "使用当前术语译文";
}

function validateParsedTerms(terms: GlossaryTerm[]): { ok: boolean; message: string } {
  const validTerms = terms.filter((term) => term.source?.trim());
  if (!validTerms.length) {
    return {
      ok: false,
      message: "未识别到有效术语，请检查文件格式后重新上传。",
    };
  }
  if (validTerms.length !== terms.length) {
    return {
      ok: false,
      message: "解析结果中存在缺少原文的术语，当前文件不合法，请修正后重新上传。",
    };
  }
  return {
    ok: true,
    message: `已识别 ${validTerms.length} 条术语，请在当前页面检查后确认添加。`,
  };
}

export function TranslationGlossaryPanel({
  locationSearch,
  reloadToken = 0,
  onRequestAiSuggestion,
  mode = "summary",
  onBack,
}: TranslationGlossaryPanelProps) {
  const shopify = useAppBridge();
  const isFullEditorMode = mode === "full-editor";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [fileParsing, setFileParsing] = useState(false);
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [uploadDialogError, setUploadDialogError] = useState<string | null>(null);
  const [fileParseNote, setFileParseNote] = useState("");
  const [fileParseName, setFileParseName] = useState("");
  const [parseFeedback, setParseFeedback] = useState<ParseFeedback | null>(null);
  const [uploadMode, setUploadMode] = useState<"merge" | "replace">("merge");
  const [previewRows, setPreviewRows] = useState<ParsedPreviewRow[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [termEditDraft, setTermEditDraft] = useState<TermEditDraft | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPage, setEditorPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/translate/v4/glossary${locationSearch}`);
      const payload = (await res.json()) as {
        ok?: boolean;
        terms?: GlossaryTerm[];
        note?: string;
        error?: string;
      };
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error ?? "加载术语表失败");
      }
      setTerms(payload.terms ?? []);
      setDirty(false);
      if (payload.note) shopify.toast.show(payload.note);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [locationSearch, shopify]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  const updateTerm = (idx: number, patch: Partial<GlossaryTerm>) => {
    setTerms((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
    setDirty(true);
  };

  const deleteTerm = (idx: number) => {
    setTerms((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
    if (editingIdx === idx) {
      setEditingIdx(null);
      setTermEditDraft(null);
    }
  };

  const addTerm = () => {
    setTerms((prev) => [...prev, { source: "" }]);
    setDirty(true);
    setUploadOpen(false);
    setEditorPage(Math.max(1, Math.ceil((terms.length + 1) / GLOSSARY_PAGE_SIZE)));
  };

  const handleSave = async () => {
    const invalid = terms.some((t) => !t.source.trim());
    if (invalid) {
      setError("请填写每条术语的原文，或删除空行");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/translate/v4/glossary${locationSearch}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terms }),
      });
      const payload = (await res.json()) as { ok?: boolean; count?: number; error?: string };
      if (!res.ok || !payload.ok) throw new Error(payload.error ?? "保存失败");
      shopify.toast.show(`已保存 ${payload.count ?? terms.length} 条术语`);
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const openUploadDialog = () => {
    setUploadDialogError(null);
    setSelectedUploadFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setUploadOpen(true);
  };

  const closeUploadDialog = () => {
    if (fileParsing) return;
    setUploadDialogError(null);
    setSelectedUploadFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setUploadOpen(false);
  };

  const handleParseSelectedFile = async () => {
    if (!selectedUploadFile) {
      setUploadDialogError("请先选择需要解析的文件");
      return;
    }

    setFileParsing(true);
    setUploadDialogError(null);
    setError(null);
    setPreviewRows([]);
    setParseFeedback(null);
    setFileParseName(selectedUploadFile.name);

    try {
      const formData = new FormData();
      formData.append("file", selectedUploadFile);
      const res = await fetch(`/api/translate/v4/glossary/parse${locationSearch}`, {
        method: "POST",
        body: formData,
      });
      const payload = (await res.json()) as {
        ok?: boolean;
        terms?: GlossaryTerm[];
        count?: number;
        source?: string;
        note?: string;
        error?: string;
      };
      if (!res.ok || !payload.ok) throw new Error(payload.error ?? "文件解析失败");

      const rows = (payload.terms ?? []).map((t, i) => ({ ...t, _key: i, _selected: true }));
      const validation = validateParsedTerms(payload.terms ?? []);

      setPreviewRows(rows);
      setFileParseNote(
        payload.note ??
          `已从「${payload.source ?? selectedUploadFile.name}」识别出 ${payload.count ?? rows.length} 条术语，请检查后确认添加。`,
      );
      setParseFeedback({
        status: validation.ok ? "valid" : "invalid",
        message: validation.message,
        fileName: payload.source ?? selectedUploadFile.name,
      });
      setUploadOpen(false);
      setSelectedUploadFile(null);
      shopify.toast.show(validation.ok ? "文件解析完成" : "文件格式不合法，请重新上传");
    } catch (err) {
      setUploadDialogError(err instanceof Error ? err.message : String(err));
      setFileParseName("");
    } finally {
      setFileParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const confirmFileParse = () => {
    if (parseFeedback?.status === "invalid") {
      setError("当前解析结果不合法，请重新上传文件后再继续。");
      return;
    }
    const selected = previewRows
      .filter((r) => r._selected)
      .map(({ _key: _k, _selected: _s, ...term }) => term);
    if (!selected.length) {
      setError("请至少选择一条术语");
      return;
    }
    const merged = uploadMode === "replace" ? selected : mergeTermsClient(terms, selected);
    setTerms(merged);
    setDirty(true);
    setPreviewRows([]);
    setFileParseName("");
    setFileParseNote("");
    setParseFeedback(null);
    shopify.toast.show(`已添加 ${selected.length} 条术语，请保存后生效`);
  };

  const openTermEditor = (idx: number) => {
    const term = terms[idx];
    const entries = Object.entries(term.translations ?? {});
    setTermEditDraft({
      source: term.source ?? "",
      note: term.note ?? "",
      doNotTranslate: !!term.doNotTranslate,
      localeRows: entries.length ? entries.map(([locale, value]) => ({ locale, value })) : [{ locale: "", value: "" }],
    });
    setEditingIdx(idx);
  };

  const closeTermEditor = () => {
    setEditingIdx(null);
    setTermEditDraft(null);
  };

  const saveTermEditor = () => {
    if (editingIdx === null || !termEditDraft) return;
    const result: Record<string, string> = {};
    for (const row of termEditDraft.localeRows) {
      const k = row.locale.trim().toLowerCase();
      const v = row.value.trim();
      if (k && v) result[k] = v;
    }
    setTerms((prev) =>
      prev.map((term, idx) =>
        idx === editingIdx
          ? {
              ...term,
              source: termEditDraft.source,
              note: termEditDraft.note.trim() || undefined,
              doNotTranslate: termEditDraft.doNotTranslate || undefined,
              translations: Object.keys(result).length ? result : undefined,
            }
          : term,
      ),
    );
    setDirty(true);
    closeTermEditor();
  };

  const previewSelectedCount = previewRows.filter((r) => r._selected).length;
  const previewAllSelected = previewRows.length > 0 && previewRows.every((r) => r._selected);
  const totalEditorPages = Math.max(1, Math.ceil(terms.length / GLOSSARY_PAGE_SIZE));
  const pagedTerms = useMemo(
    () =>
      terms
        .slice((editorPage - 1) * GLOSSARY_PAGE_SIZE, editorPage * GLOSSARY_PAGE_SIZE)
        .map((term, offset) => ({
          term,
          idx: (editorPage - 1) * GLOSSARY_PAGE_SIZE + offset,
        })),
    [editorPage, terms],
  );

  useEffect(() => {
    setEditorPage((prev) => Math.min(prev, totalEditorPages));
  }, [totalEditorPages]);

  const renderEditorBody = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {error ? <div style={formErrorBoxStyle}>{error}</div> : null}

      {parseFeedback ? (
        <div style={pageInnerPanelStyle}>
          <div style={parseResultHeaderStyle}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <div style={pageFieldLabelStyle}>文件解析结果</div>
              <div style={parseResultMetaStyle}>
                文件：{parseFeedback.fileName}
                {fileParseNote ? ` · ${fileParseNote}` : ""}
              </div>
            </div>
            <span
              style={
                parseFeedback.status === "valid"
                  ? parseStatusStyle("valid")
                  : parseStatusStyle("invalid")
              }
            >
              {parseFeedback.status === "valid" ? "合法" : "不合法"}
            </span>
          </div>

          <div
            style={
              parseFeedback.status === "valid"
                ? parseFeedbackBoxStyle("valid")
                : parseFeedbackBoxStyle("invalid")
            }
          >
            {parseFeedback.message}
          </div>

          {previewRows.length > 0 ? (
            <>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center", marginTop: "0.75rem" }}>
                <label style={checkboxLabelStyle}>
                  <input
                    type="checkbox"
                    checked={previewAllSelected}
                    onChange={(e) =>
                      setPreviewRows((prev) => prev.map((r) => ({ ...r, _selected: e.target.checked })))
                    }
                    disabled={parseFeedback.status === "invalid"}
                  />
                  全选（{previewSelectedCount}/{previewRows.length}）
                </label>
                <label style={radioLabelStyle}>
                  <input
                    type="radio"
                    name="glossary-upload-mode"
                    checked={uploadMode === "merge"}
                    onChange={() => setUploadMode("merge")}
                    disabled={parseFeedback.status === "invalid"}
                  />
                  合并到现有
                </label>
                <label style={radioLabelStyle}>
                  <input
                    type="radio"
                    name="glossary-upload-mode"
                    checked={uploadMode === "replace"}
                    onChange={() => setUploadMode("replace")}
                    disabled={parseFeedback.status === "invalid"}
                  />
                  替换现有列表
                </label>
                <s-button type="button" variant="secondary" onClick={openUploadDialog}>
                  重新上传文件
                </s-button>
                <s-button
                  type="button"
                  variant="primary"
                  onClick={confirmFileParse}
                  {...(parseFeedback.status === "invalid" ? { disabled: true } : {})}
                >
                  确认添加（{previewSelectedCount} 条）
                </s-button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", marginTop: "0.75rem", maxHeight: "320px", overflowY: "auto" }}>
                {previewRows.map((row) => (
                  <div key={row._key} style={previewRowStyle}>
                    <label style={checkboxLabelStyle}>
                      <input
                        type="checkbox"
                        checked={row._selected}
                        disabled={parseFeedback.status === "invalid"}
                        onChange={(e) =>
                          setPreviewRows((prev) =>
                            prev.map((r) => (r._key === row._key ? { ...r, _selected: e.target.checked } : r)),
                          )
                        }
                      />
                    </label>
                    <input
                      type="text"
                      value={row.source}
                      onChange={(e) =>
                        setPreviewRows((prev) =>
                          prev.map((r) => (r._key === row._key ? { ...r, source: e.target.value } : r)),
                        )
                      }
                      style={{ ...inputStyle, flex: "1 1 140px" }}
                    />
                    <label style={checkboxLabelStyle}>
                      <input
                        type="checkbox"
                        checked={!!row.doNotTranslate}
                        disabled={parseFeedback.status === "invalid"}
                        onChange={(e) =>
                          setPreviewRows((prev) =>
                            prev.map((r) =>
                              r._key === row._key ? { ...r, doNotTranslate: e.target.checked || undefined } : r,
                            ),
                          )
                        }
                      />
                      勿译
                    </label>
                    <span style={{ fontSize: "0.75rem", color: pageColorTokens.textSecondary, flex: "2 1 180px" }}>
                      {formatTranslationsSummary(row.translations)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ ...pageHintTextStyle, marginTop: "0.75rem" }}>
              当前未生成可用术语，请重新上传符合格式的文件。
            </div>
          )}
        </div>
      ) : null}

      {terms.length === 0 && previewRows.length === 0 ? (
        <div style={emptyCompactStateStyle}>暂无术语，点击“新增术语”开始编辑。</div>
      ) : terms.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={editorListHeaderStyle}>
            <div style={pageFieldLabelStyle}>当前术语列表（{terms.length} 条）</div>
          </div>
          <div style={editorTableShellStyle}>
            <div style={termTableHeaderStyle}>
              <div style={termTableHeaderCellStyle}>原文</div>
              <div style={termTableHeaderCellStyle}>规则</div>
              <div style={termTableHeaderCellStyle}>生效语言</div>
              <div style={termTableHeaderCellStyle}>目标译文</div>
              <div style={termTableHeaderCellStyle}>操作</div>
            </div>
            <div style={editorTableBodyStyle}>
              {pagedTerms.map(({ term, idx }) => (
                <div key={idx} style={termRowStyle}>
                  <div style={termGridRowStyle}>
                    <div style={termTableCellStyle}>
                      <input
                        type="text"
                        value={term.source ?? ""}
                        placeholder="原文"
                        onChange={(e) => updateTerm(idx, { source: e.target.value })}
                        style={tableInputStyle}
                      />
                    </div>
                    <div style={termTableCellStyle}>
                      <div style={tableTextStyle}>{getRuleDescription(term.doNotTranslate)}</div>
                    </div>
                    <div style={termTableCellStyle}>
                      <div style={tableTextStyle}>{formatEffectiveLocales(term)}</div>
                    </div>
                    <div style={termTableCellStyle}>
                      <div style={tableTextStyle}>
                        {term.doNotTranslate ? (term.source?.trim() || "—") : formatTranslationsSummary(term.translations)}
                      </div>
                    </div>
                    <div style={termTableCellStyle}>
                      <div style={operationRowStyle}>
                        <button type="button" onClick={() => openTermEditor(idx)} style={actionButtonStyle}>
                          编辑译文
                        </button>
                        <button type="button" onClick={() => deleteTerm(idx)} style={dangerActionButtonStyle}>
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={editorPagerRowStyle}>
              <div style={editorPagerMetaStyle}>
                第 {editorPage} / {totalEditorPages} 页，每页最多 {GLOSSARY_PAGE_SIZE} 条，共 {terms.length} 条
              </div>
              <div style={editorPagerButtonsStyle}>
                <button
                  type="button"
                  style={pagerButtonStyle(editorPage === 1)}
                  onClick={() => setEditorPage((prev) => Math.max(1, prev - 1))}
                  disabled={editorPage === 1}
                >
                  上一页
                </button>
                <button
                  type="button"
                  style={pagerButtonStyle(editorPage === totalEditorPages)}
                  onClick={() => setEditorPage((prev) => Math.min(totalEditorPages, prev + 1))}
                  disabled={editorPage === totalEditorPages}
                >
                  下一页
                </button>
              </div>
            </div>
          </div>
          {dirty ? <SaveGlossaryBar saving={saving} onSave={() => void handleSave()} /> : null}
        </div>
      ) : null}
    </div>
  );

  if (isFullEditorMode) {
    return (
      <PageSurface>
        <div style={editorHeaderStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", minWidth: 0 }}>
            {onBack ? (
              <button type="button" style={backButtonStyle} onClick={onBack}>
                返回翻译风格列表
              </button>
            ) : null}
            <div style={titleStyle}>编辑术语表</div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <s-button type="button" variant="secondary" onClick={onRequestAiSuggestion}>
              生成 AI 建议
            </s-button>
            <s-button type="button" variant="secondary" onClick={openUploadDialog}>
              上传文件
            </s-button>
            <s-button type="button" variant="secondary" onClick={addTerm}>
              新增术语
            </s-button>
          </div>
        </div>
        {renderEditorBody()}
      </PageSurface>
    );
  }

  return (
    <>
      <PageSurface>
        <div style={headerRowStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", minWidth: 0 }}>
            <span style={titleStyle}>术语表</span>
            <span style={{ fontWeight: 500, fontSize: "0.8125rem", color: pageColorTokens.textSecondary }}>
              （{terms.length} 条{dirty ? " · 未保存" : ""}）
            </span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <s-button type="button" variant="secondary" onClick={onRequestAiSuggestion}>
              生成 AI 建议
            </s-button>
            <s-button
              type="button"
              variant="secondary"
              onClick={() => {
                setEditorPage(1);
                setEditorOpen(true);
              }}
            >
              编辑术语表
            </s-button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.9rem" }}>
          {error && <div style={formErrorBoxStyle}>{error}</div>}
          {loading ? (
            <div style={{ fontSize: "0.875rem", color: pageColorTokens.textSecondary }}>加载术语表…</div>
          ) : terms.length === 0 ? (
            <div style={emptyCompactStateStyle}>暂无术语，点击“编辑术语表”开始新增。</div>
          ) : (
            <div style={summaryPanelStyle}>
              <div style={pageFieldLabelStyle}>摘要预览</div>
              <div style={summaryTermsListStyle}>
                {terms.slice(0, 6).map((term, index) => (
                  <div key={`${term.source}-${index}`} style={summaryTermChipStyle}>
                    <span style={{ fontWeight: 600, color: pageColorTokens.textPrimary }}>{term.source || "未命名术语"}</span>
                    <span style={{ color: pageColorTokens.textSecondary }}>
                      {term.doNotTranslate ? (term.source || "不翻译") : formatTranslationsSummary(term.translations)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </PageSurface>

      {editorOpen ? (
        <div style={overlayBackdropStyle}>
          <div style={editorPanelStyle}>
            <div style={editorHeaderStyle}>
              <div>
                <div style={titleStyle}>编辑术语表</div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <s-button type="button" variant="secondary" onClick={onRequestAiSuggestion}>
                  生成 AI 建议
                </s-button>
                <s-button type="button" variant="secondary" onClick={openUploadDialog}>
                  上传文件
                </s-button>
                <s-button type="button" variant="secondary" onClick={addTerm}>
                  新增术语
                </s-button>
                <s-button type="button" variant="secondary" onClick={() => setEditorOpen(false)}>
                  完成
                </s-button>
              </div>
            </div>

            {renderEditorBody()}
          </div>
        </div>
      ) : null}

      <DialogShell
        open={uploadOpen}
        onClose={closeUploadDialog}
        width={720}
        title="上传文件"
        description="选择文件后解析术语内容，解析结果会回到当前页面展示并校验是否合法。"
        footer={
          <div style={modalFooterStyle}>
            <s-button type="button" variant="secondary" onClick={closeUploadDialog} {...(fileParsing ? { disabled: true } : {})}>
              取消
            </s-button>
            <s-button
              type="button"
              variant="primary"
              onClick={() => void handleParseSelectedFile()}
              {...(!selectedUploadFile || fileParsing ? { disabled: true } : {})}
            >
              {fileParsing ? "解析中…" : "解析文件"}
            </s-button>
          </div>
        }
      >
        <div style={uploadDialogContentStyle}>
          <div style={uploadExamplePanelStyle}>
            <div style={pageFieldLabelStyle}>支持格式与规则</div>
            <div style={{ ...pageHintTextStyle, marginTop: "0.35rem" }}>
              支持 {FILE_TYPES_LABEL}，单个文件最大 10 MB。建议一行一个术语，包含原文与目标译文；若文件内容过长，系统会自动截断并提示分批上传。
            </div>
            <div style={uploadRulesListStyle}>
              <div>示例 1：`原文,英文译文,日文译文`</div>
              <div>示例 2：`source: Spark`、`en: Spark`、`ja: Spark`</div>
              <div>示例 3：原文与多语言译文分列整理，避免混入大段说明文字。</div>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept={FILE_ACCEPT}
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setSelectedUploadFile(file);
              setUploadDialogError(null);
            }}
          />

          <div style={uploadSelectRowStyle}>
            <s-button
              type="button"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              {...(fileParsing ? { disabled: true } : {})}
            >
              选择文件
            </s-button>
            <div style={uploadFileMetaStyle}>
              {selectedUploadFile ? `已选择：${selectedUploadFile.name}` : "请选择要解析的术语文件"}
            </div>
          </div>

          {uploadDialogError ? <div style={formErrorBoxStyle}>{uploadDialogError}</div> : null}
        </div>
      </DialogShell>

      <DialogShell
        open={editingIdx !== null && termEditDraft !== null}
        onClose={closeTermEditor}
        width={760}
        title="编辑译文"
        description={
          termEditDraft
            ? `${termEditDraft.source || "未填写原文"} · ${getRuleDescription(termEditDraft.doNotTranslate)}`
            : undefined
        }
        footer={
          <div style={modalFooterStyle}>
            <s-button type="button" variant="secondary" onClick={closeTermEditor}>
              取消
            </s-button>
            <s-button type="button" variant="primary" onClick={saveTermEditor}>
              确定
            </s-button>
          </div>
        }
      >
        {termEditDraft ? (
          <div style={termEditFormStyle}>
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={termEditDraft.doNotTranslate}
                onChange={(e) =>
                  setTermEditDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          doNotTranslate: e.target.checked,
                        }
                      : prev,
                  )
                }
              />
              保持原文，不参与翻译
            </label>

            {!termEditDraft.doNotTranslate ? (
              <div style={localeEditorPanelStyle}>
                {termEditDraft.localeRows.map((row, rowIdx) => (
                  <div key={rowIdx} style={localeEditRowStyle}>
                    <input
                      type="text"
                      value={row.locale}
                      placeholder="语言"
                      onChange={(e) =>
                        setTermEditDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                localeRows: prev.localeRows.map((item, index) =>
                                  index === rowIdx ? { ...item, locale: e.target.value } : item,
                                ),
                              }
                            : prev,
                        )
                      }
                      style={{ ...inputStyle, width: "7rem" }}
                    />
                    <input
                      type="text"
                      value={row.value}
                      placeholder="目标译文"
                      onChange={(e) =>
                        setTermEditDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                localeRows: prev.localeRows.map((item, index) =>
                                  index === rowIdx ? { ...item, value: e.target.value } : item,
                                ),
                              }
                            : prev,
                        )
                      }
                      style={{ ...inputStyle, flex: 1, minWidth: "12rem" }}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setTermEditDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                localeRows: prev.localeRows.filter((_, index) => index !== rowIdx),
                              }
                            : prev,
                        )
                      }
                      style={dangerBtnStyle}
                    >
                      删除
                    </button>
                  </div>
                ))}
                <div style={termActionRowStyle}>
                  <s-button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setTermEditDraft((prev) =>
                        prev
                          ? { ...prev, localeRows: [...prev.localeRows, { locale: "", value: "" }] }
                          : prev,
                      )
                    }
                  >
                    添加语言
                  </s-button>
                </div>
              </div>
            ) : (
              <div style={emptyCompactStateStyle}>当前规则会保持原文，目标译文默认使用原文内容。</div>
            )}
          </div>
        ) : null}
      </DialogShell>
    </>
  );
}

const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  marginBottom: "1rem",
  flexWrap: "wrap",
};

const titleStyle: CSSProperties = {
  fontWeight: 700,
  fontSize: "1rem",
  color: pageColorTokens.textPrimary,
};

const summaryPanelStyle: CSSProperties = {
  ...pageInnerPanelStyle,
  gap: "0.75rem",
};

const editorListHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  flexWrap: "wrap",
};

const editorTableShellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minHeight: "26rem",
};

const editorTableBodyStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: "1 1 auto",
};

const editorPagerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  flexWrap: "wrap",
  paddingTop: "0.75rem",
  minHeight: "3rem",
  marginTop: "auto",
};

const editorPagerMetaStyle: CSSProperties = {
  fontSize: "0.75rem",
  color: pageColorTokens.textSecondary,
};

const editorPagerButtonsStyle: CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  flexWrap: "wrap",
};

const summaryTermsListStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.55rem",
};

const parseResultHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "0.75rem",
  flexWrap: "wrap",
};

const parseResultMetaStyle: CSSProperties = {
  fontSize: "0.75rem",
  color: pageColorTokens.textSecondary,
  lineHeight: 1.6,
};

const summaryTermChipStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.15rem",
  padding: "0.55rem 0.7rem",
  borderRadius: "12px",
  background: pageColorTokens.surface,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  minWidth: "140px",
};

const overlayBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.24)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1rem",
  zIndex: 80,
};

const editorPanelStyle: CSSProperties = {
  width: "min(1100px, 100%)",
  maxHeight: "86vh",
  overflow: "auto",
  borderRadius: "20px",
  background: "#ffffff",
  boxShadow: "0 24px 60px rgba(15, 23, 42, 0.18)",
  padding: "1rem",
};

const editorHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "0.8rem",
  flexWrap: "wrap",
  marginBottom: "1rem",
};

const backButtonStyle: CSSProperties = {
  alignSelf: "flex-start",
  border: "none",
  background: "transparent",
  color: pageColorTokens.brandBlue,
  cursor: "pointer",
  padding: 0,
  fontSize: "0.8125rem",
  fontWeight: 600,
};

function pagerButtonStyle(disabled: boolean): CSSProperties {
  return {
    border: "none",
    background: disabled ? pageColorTokens.surfaceMuted : pageColorTokens.surface,
    color: disabled ? pageColorTokens.textFootnote : pageColorTokens.textBody,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: "0.8125rem",
    padding: "0.45rem 0.7rem",
    borderRadius: "999px",
    boxShadow: disabled ? "none" : "0 1px 2px rgba(15, 23, 42, 0.06)",
  };
}

const termRowStyle: CSSProperties = {
  padding: "0.7rem 0",
  borderBottom: `1px solid ${pageColorTokens.borderSubtle}`,
};

const termTableHeaderStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 0.95fr) minmax(0, 0.8fr) minmax(0, 1.2fr) 130px",
  gap: "0.75rem",
  padding: "0 0 0.3rem",
  borderBottom: `1px solid ${pageColorTokens.borderSubtle}`,
};

const termTableHeaderCellStyle: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
  letterSpacing: "0.01em",
  minWidth: 0,
};

const termGridRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 0.95fr) minmax(0, 0.8fr) minmax(0, 1.2fr) 130px",
  gap: "0.75rem",
  alignItems: "center",
  width: "100%",
};

const termTableCellStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  minWidth: 0,
};

const termActionRowStyle: CSSProperties = {
  display: "flex",
  gap: "0.35rem",
  alignItems: "center",
  justifyContent: "flex-end",
  flexWrap: "wrap",
};

const operationRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "0.45rem",
  flexWrap: "wrap",
  width: "100%",
};

const actionButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: pageColorTokens.brandBlue,
  cursor: "pointer",
  fontSize: "0.75rem",
  fontWeight: 600,
  padding: "0.2rem 0.1rem",
};

const dangerActionButtonStyle: CSSProperties = {
  ...actionButtonStyle,
  color: pageColorTokens.criticalText,
};

const emptyCompactStateStyle: CSSProperties = {
  padding: "1rem 0",
  fontSize: "0.75rem",
  color: pageColorTokens.textSecondary,
  lineHeight: 1.6,
};

const previewRowStyle: CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  alignItems: "center",
  flexWrap: "wrap",
  padding: "0.45rem 0.55rem",
  borderRadius: "6px",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surfaceMuted,
};

function parseStatusStyle(status: "valid" | "invalid"): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: "999px",
    padding: "0.2rem 0.55rem",
    fontSize: "0.75rem",
    fontWeight: 700,
    color: status === "valid" ? pageColorTokens.brandGreen : pageColorTokens.criticalText,
    background: status === "valid" ? pageColorTokens.brandGreenLight : "rgba(239, 68, 68, 0.08)",
    border: `1px solid ${
      status === "valid" ? "rgba(0, 166, 124, 0.18)" : "rgba(239, 68, 68, 0.16)"
    }`,
  };
}

function parseFeedbackBoxStyle(status: "valid" | "invalid"): CSSProperties {
  return {
    marginTop: "0.75rem",
    borderRadius: "12px",
    padding: "0.75rem 0.85rem",
    fontSize: "0.8125rem",
    lineHeight: 1.6,
    color: status === "valid" ? pageColorTokens.brandGreen : pageColorTokens.criticalText,
    background: status === "valid" ? pageColorTokens.brandGreenLight : "rgba(239, 68, 68, 0.08)",
    border: `1px solid ${
      status === "valid" ? "rgba(0, 166, 124, 0.18)" : "rgba(239, 68, 68, 0.16)"
    }`,
  };
}

const uploadDialogContentStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.85rem",
};

const uploadExamplePanelStyle: CSSProperties = {
  ...pageInnerPanelStyle,
  gap: "0.55rem",
};

const uploadRulesListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
  fontSize: "0.8125rem",
  color: pageColorTokens.textBody,
  lineHeight: 1.6,
};

const uploadSelectRowStyle: CSSProperties = {
  display: "flex",
  gap: "0.75rem",
  alignItems: "center",
  flexWrap: "wrap",
};

const uploadFileMetaStyle: CSSProperties = {
  fontSize: "0.8125rem",
  color: pageColorTokens.textSecondary,
  lineHeight: 1.5,
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "0.4rem 0.55rem",
  borderRadius: "6px",
  border: `1px solid ${pageColorTokens.borderInput}`,
  fontSize: "0.8125rem",
  color: pageColorTokens.textBody,
  boxSizing: "border-box",
};

const tableInputStyle: CSSProperties = {
  ...inputStyle,
  minWidth: 0,
};

const tableTextStyle: CSSProperties = {
  width: "100%",
  fontSize: "0.8125rem",
  color: pageColorTokens.textBody,
  lineHeight: 1.5,
  overflowWrap: "anywhere",
};

const checkboxLabelStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.3rem",
  fontSize: "0.75rem",
  color: pageColorTokens.textSecondary,
  whiteSpace: "nowrap",
  cursor: "pointer",
  userSelect: "none",
};

const radioLabelStyle: CSSProperties = {
  ...checkboxLabelStyle,
  fontSize: "0.8125rem",
};

const linkBtnStyle: CSSProperties = {
  background: "none",
  border: "none",
  padding: "0.2rem 0.35rem",
  fontSize: "0.75rem",
  fontWeight: 600,
  color: pageColorTokens.brandBlue,
  cursor: "pointer",
  textDecoration: "underline",
};

const dangerBtnStyle: CSSProperties = {
  background: "none",
  border: "none",
  padding: "0.2rem 0.35rem",
  fontSize: "0.75rem",
  color: pageColorTokens.criticalText,
  cursor: "pointer",
};

const termEditFormStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.9rem",
};

const termEditMetaStyle: CSSProperties = {
  marginTop: "0.25rem",
  fontSize: "0.75rem",
  color: pageColorTokens.textSecondary,
};

const localeEditorPanelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.65rem",
};

const localeEditRowStyle: CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  flexWrap: "wrap",
};

const modalFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "0.5rem",
  flexWrap: "wrap",
};

const saveBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  flexWrap: "wrap",
  marginTop: "0.75rem",
  padding: "0.75rem 0.85rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.brandGreen}`,
  background: pageColorTokens.brandGreenLight,
};
