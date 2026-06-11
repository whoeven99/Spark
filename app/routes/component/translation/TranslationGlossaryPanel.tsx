import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { GlossaryTerm } from "../../../server/translation/glossary.server";
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
};

type ParsedPreviewRow = GlossaryTerm & { _key: number; _selected: boolean };

const FILE_ACCEPT = ".txt,.md,.pdf,.docx,.csv,.xlsx,.xls,.json";
const FILE_TYPES_LABEL = ".txt / .md / .pdf / .docx / .csv / .xlsx / .json";
const GLOSSARY_PAGE_SIZE = 10;

const GLOSSARY_EXAMPLES: Array<{
  source: string;
  summary: string;
  note?: string;
}> = [
  { source: "闪购", summary: "en → Flash Sale · ja → フラッシュセール", note: "活动词固定译法" },
  { source: "Acme", summary: "勿译（品牌名保持原文）", note: "勾选「勿译」" },
  { source: "包邮", summary: "en → Free Shipping", note: "可点「译法」配置多语言" },
];

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

function GlossaryExamplePanel() {
  return (
    <div style={examplePanelStyle}>
      <div style={pageFieldLabelStyle}>术语表示例</div>
      <div style={{ ...pageHintTextStyle, marginTop: 0, marginBottom: "0.65rem" }}>
        以下为参考格式，不会自动写入。可上传品牌指南/术语文档由 AI 解析，或点「新增术语」逐条填写。
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
        {GLOSSARY_EXAMPLES.map((ex) => (
          <div key={ex.source} style={exampleRowStyle}>
            <span style={exampleSourceStyle}>{ex.source}</span>
            <span style={exampleSummaryStyle}>{ex.summary}</span>
            {ex.note && <span style={exampleNoteStyle}>{ex.note}</span>}
          </div>
        ))}
      </div>
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
  return Object.entries(translations)
    .map(([loc, val]) => `${loc}: ${val}`)
    .join(" · ");
}

export function TranslationGlossaryPanel({
  locationSearch,
  reloadToken = 0,
  onRequestAiSuggestion,
}: TranslationGlossaryPanelProps) {
  const shopify = useAppBridge();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [fileParsing, setFileParsing] = useState(false);
  const [fileParseNote, setFileParseNote] = useState("");
  const [fileParseName, setFileParseName] = useState("");
  const [uploadMode, setUploadMode] = useState<"merge" | "replace">("merge");
  const [previewRows, setPreviewRows] = useState<ParsedPreviewRow[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [localeRows, setLocaleRows] = useState<Array<{ locale: string; value: string }>>([]);
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
    if (editingIdx === idx) setEditingIdx(null);
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

  const handleFileSelected = async (file: File) => {
    setUploadOpen(true);
    setFileParsing(true);
    setError(null);
    setPreviewRows([]);
    setFileParseName(file.name);
    try {
      const formData = new FormData();
      formData.append("file", file);
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
      setPreviewRows(rows);
      setFileParseNote(
        payload.note ??
          `LLM 从「${payload.source ?? file.name}」中识别出 ${payload.count ?? rows.length} 条术语，请检查后确认添加`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setFileParseName("");
    } finally {
      setFileParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const confirmFileParse = () => {
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
    setUploadOpen(false);
    shopify.toast.show(`已添加 ${selected.length} 条术语，请保存后生效`);
  };

  const openTranslationsEditor = (idx: number) => {
    const term = terms[idx];
    const entries = Object.entries(term.translations ?? {});
    setLocaleRows(
      entries.length ? entries.map(([locale, value]) => ({ locale, value })) : [{ locale: "", value: "" }],
    );
    setEditingIdx(idx);
  };

  const saveTranslations = () => {
    if (editingIdx === null) return;
    const result: Record<string, string> = {};
    for (const row of localeRows) {
      const k = row.locale.trim().toLowerCase();
      const v = row.value.trim();
      if (k && v) result[k] = v;
    }
    updateTerm(editingIdx, {
      translations: Object.keys(result).length ? result : undefined,
    });
    setEditingIdx(null);
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
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <GlossaryExamplePanel />
              <div style={emptyActionRowStyle}>
                <div style={{ ...pageHintTextStyle, marginTop: 0 }}>
                  术语表为空时，可先生成一版 AI 建议，再进入编辑页确认或调整。
                </div>
              </div>
            </div>
          ) : (
            <div style={summaryPanelStyle}>
              <div style={pageFieldLabelStyle}>摘要预览</div>
              <div style={{ ...pageHintTextStyle, marginTop: 0 }}>
                主界面只展示摘要，点击“编辑术语表”进入独立编辑界面查看和修改全部术语。
              </div>
              <div style={summaryTermsListStyle}>
                {terms.slice(0, 6).map((term, index) => (
                  <div key={`${term.source}-${index}`} style={summaryTermChipStyle}>
                    <span style={{ fontWeight: 600, color: pageColorTokens.textPrimary }}>{term.source || "未命名术语"}</span>
                    <span style={{ color: pageColorTokens.textSecondary }}>
                      {term.doNotTranslate ? "勿译" : formatTranslationsSummary(term.translations)}
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
                <div style={{ ...pageHintTextStyle, marginTop: "0.3rem" }}>
                  在这里查看和维护全部术语；主界面仅保留摘要，避免列表过长。
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <s-button type="button" variant="secondary" onClick={onRequestAiSuggestion}>
                  生成 AI 建议
                </s-button>
                <s-button type="button" variant="secondary" onClick={() => setUploadOpen((v) => !v)}>
                  {uploadOpen ? "收起上传区" : "上传文件 AI 解析"}
                </s-button>
                <s-button type="button" variant="secondary" onClick={addTerm}>
                  新增术语
                </s-button>
                <s-button type="button" variant="secondary" onClick={() => setEditorOpen(false)}>
                  完成
                </s-button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {uploadOpen && (
                <div style={pageInnerPanelStyle}>
                  <div style={pageFieldLabelStyle}>上传文件批量添加</div>
                  <div style={{ ...pageHintTextStyle, marginTop: 0, marginBottom: "0.5rem" }}>
                    支持 {FILE_TYPES_LABEL} 等格式，最大 10 MB。CSV、Excel、PDF、Word 等均由 LLM 自动提取术语对照。
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={FILE_ACCEPT}
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleFileSelected(file);
                    }}
                  />
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                    <s-button
                      type="button"
                      variant="secondary"
                      onClick={() => fileInputRef.current?.click()}
                      {...(fileParsing ? { disabled: true } : {})}
                    >
                      {fileParsing ? "LLM 解析中…" : "选择文件"}
                    </s-button>
                    {fileParseName && !fileParsing ? (
                      <span style={{ fontSize: "0.8125rem", color: pageColorTokens.textSecondary }}>{fileParseName}</span>
                    ) : null}
                  </div>

                  {fileParseNote && previewRows.length > 0 ? (
                    <div style={{ ...pageHintTextStyle, marginTop: "0.75rem", color: pageColorTokens.textBody }}>
                      {fileParseNote}
                    </div>
                  ) : null}

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
                          />
                          全选（{previewSelectedCount}/{previewRows.length}）
                        </label>
                        <label style={radioLabelStyle}>
                          <input type="radio" name="glossary-upload-mode" checked={uploadMode === "merge"} onChange={() => setUploadMode("merge")} />
                          合并到现有
                        </label>
                        <label style={radioLabelStyle}>
                          <input type="radio" name="glossary-upload-mode" checked={uploadMode === "replace"} onChange={() => setUploadMode("replace")} />
                          替换现有列表
                        </label>
                        <s-button type="button" variant="primary" onClick={confirmFileParse}>
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
                  ) : null}
                </div>
              )}
              {error ? <div style={formErrorBoxStyle}>{error}</div> : null}

              {terms.length === 0 && previewRows.length === 0 ? (
                <GlossaryExamplePanel />
              ) : terms.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div style={editorListHeaderStyle}>
                    <div style={pageFieldLabelStyle}>
                      当前术语（{terms.length} 条）
                    </div>
                    <div style={editorPagerMetaStyle}>
                      第 {editorPage} / {totalEditorPages} 页
                    </div>
                  </div>
                  {pagedTerms.map(({ term, idx }) => (
                    <div key={idx} style={termRowStyle}>
                      <div style={termCardHeaderStyle}>
                        <div style={termFieldBlockStyle}>
                          <div style={miniLabelStyle}>原文术语</div>
                          <input
                            type="text"
                            value={term.source}
                            placeholder="输入原文术语"
                            onChange={(e) => updateTerm(idx, { source: e.target.value })}
                            style={inputStyle}
                          />
                        </div>
                        <div style={termActionRowStyle}>
                          <button type="button" onClick={() => openTranslationsEditor(idx)} style={linkBtnStyle}>
                            译法
                          </button>
                          <button type="button" onClick={() => deleteTerm(idx)} style={dangerBtnStyle}>
                            删除
                          </button>
                        </div>
                      </div>
                      <div style={termCardMetaStyle}>
                        <div style={termFieldBlockStyle}>
                          <div style={miniLabelStyle}>备注</div>
                          <input
                            type="text"
                            value={term.note ?? ""}
                            placeholder="补充适用场景、限制说明等"
                            onChange={(e) => updateTerm(idx, { note: e.target.value || undefined })}
                            style={inputStyle}
                          />
                        </div>
                        <div style={toggleCardStyle}>
                          <span style={miniLabelStyle}>翻译规则</span>
                          <label style={checkboxLabelStyle} title="勾选后所有语言均不翻译">
                            <input
                              type="checkbox"
                              checked={!!term.doNotTranslate}
                              onChange={(e) => updateTerm(idx, { doNotTranslate: e.target.checked || undefined })}
                            />
                            勿译
                          </label>
                        </div>
                      </div>
                      {!term.doNotTranslate ? (
                        <div style={translationsSummaryCardStyle}>
                          <div style={miniLabelStyle}>当前译法</div>
                          <div style={translationsSummaryTextStyle}>{formatTranslationsSummary(term.translations)}</div>
                        </div>
                      ) : null}
                      {editingIdx === idx ? (
                        <div style={{ ...pageInnerPanelStyle, marginTop: "0.5rem" }}>
                          <div style={pageFieldLabelStyle}>各语言译法 · 「{term.source || "…"}」</div>
                          <div style={{ ...pageHintTextStyle, marginTop: 0 }}>语言代码示例：en · zh-CN · ja · fr</div>
                          {localeRows.map((row, rowIdx) => (
                            <div key={rowIdx} style={{ display: "flex", gap: "0.5rem", marginTop: "0.4rem", flexWrap: "wrap" }}>
                              <input
                                type="text"
                                value={row.locale}
                                placeholder="语言"
                                onChange={(e) =>
                                  setLocaleRows((prev) =>
                                    prev.map((r, i) => (i === rowIdx ? { ...r, locale: e.target.value } : r)),
                                  )
                                }
                                style={{ ...inputStyle, width: "6rem" }}
                              />
                              <input
                                type="text"
                                value={row.value}
                                placeholder="对应翻译"
                                onChange={(e) =>
                                  setLocaleRows((prev) =>
                                    prev.map((r, i) => (i === rowIdx ? { ...r, value: e.target.value } : r)),
                                  )
                                }
                                style={{ ...inputStyle, flex: 1, minWidth: "10rem" }}
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
                          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem", flexWrap: "wrap" }}>
                            <s-button
                              type="button"
                              variant="secondary"
                              onClick={() => setLocaleRows((prev) => [...prev, { locale: "", value: "" }])}
                            >
                              添加语言
                            </s-button>
                            <s-button type="button" variant="primary" onClick={saveTranslations}>
                              确定
                            </s-button>
                            <s-button type="button" variant="secondary" onClick={() => setEditingIdx(null)}>
                              取消
                            </s-button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {terms.length > GLOSSARY_PAGE_SIZE ? (
                    <div style={editorPagerRowStyle}>
                      <div style={editorPagerMetaStyle}>
                        每页 {GLOSSARY_PAGE_SIZE} 条，共 {terms.length} 条
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
                  ) : null}
                  {dirty ? <SaveGlossaryBar saving={saving} onSave={() => void handleSave()} /> : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
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

const emptyActionRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  flexWrap: "wrap",
};

const editorListHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  flexWrap: "wrap",
};

const editorPagerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  flexWrap: "wrap",
  paddingTop: "0.25rem",
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
  padding: "0.9rem 1rem",
  borderRadius: "12px",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: "linear-gradient(180deg, #fbfdfd 0%, #ffffff 100%)",
  boxShadow: "0 8px 22px rgba(15, 23, 42, 0.04)",
  display: "flex",
  flexDirection: "column",
  gap: "0.8rem",
};

const termCardHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "0.75rem",
  flexWrap: "wrap",
};

const termCardMetaStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.6fr) minmax(180px, 0.8fr)",
  gap: "0.75rem",
  alignItems: "stretch",
};

const termFieldBlockStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.38rem",
  minWidth: 0,
  flex: "1 1 auto",
};

const miniLabelStyle: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 600,
  color: pageColorTokens.textSecondary,
};

const termActionRowStyle: CSSProperties = {
  display: "flex",
  gap: "0.35rem",
  alignItems: "center",
  justifyContent: "flex-end",
  flexWrap: "wrap",
};

const toggleCardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: "0.45rem",
  padding: "0.7rem 0.8rem",
  borderRadius: "10px",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surfaceMuted,
};

const translationsSummaryCardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
  padding: "0.7rem 0.8rem",
  borderRadius: "10px",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surface,
};

const translationsSummaryTextStyle: CSSProperties = {
  fontSize: "0.8125rem",
  color: pageColorTokens.textBody,
  lineHeight: 1.55,
  wordBreak: "break-word",
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

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "0.4rem 0.55rem",
  borderRadius: "6px",
  border: `1px solid ${pageColorTokens.borderInput}`,
  fontSize: "0.8125rem",
  color: pageColorTokens.textBody,
  boxSizing: "border-box",
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

const examplePanelStyle: CSSProperties = {
  ...pageInnerPanelStyle,
  borderStyle: "dashed",
};

const exampleRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(72px, 0.7fr) minmax(140px, 1.5fr) minmax(100px, 1fr)",
  gap: "0.5rem",
  alignItems: "center",
  padding: "0.45rem 0.55rem",
  borderRadius: "6px",
  background: pageColorTokens.surface,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: "0.8125rem",
};

const exampleSourceStyle: CSSProperties = {
  fontWeight: 600,
  color: pageColorTokens.textPrimary,
};

const exampleSummaryStyle: CSSProperties = {
  color: pageColorTokens.textBody,
};

const exampleNoteStyle: CSSProperties = {
  fontSize: "0.75rem",
  color: pageColorTokens.textSecondary,
};
