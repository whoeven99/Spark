import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
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
};

type ParsedPreviewRow = GlossaryTerm & { _key: number; _selected: boolean };

const CSV_EXAMPLE = `source,do_not_translate,note,en,zh-CN,pl,fr
闪购,,,Flash Sale,,,Vente flash
Acme,true,品牌名,,,,,`;

const FILE_ACCEPT = ".txt,.md,.pdf,.docx,.csv,.xlsx,.xls,.json";
const FILE_TYPES_LABEL = ".txt / .md / .pdf / .docx / .csv / .xlsx / .json";

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

export function TranslationGlossaryPanel({ locationSearch }: TranslationGlossaryPanelProps) {
  const shopify = useAppBridge();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [csvOpen, setCsvOpen] = useState(false);
  const [fileParseOpen, setFileParseOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvMode, setCsvMode] = useState<"merge" | "replace">("merge");
  const [csvImporting, setCsvImporting] = useState(false);
  const [fileParsing, setFileParsing] = useState(false);
  const [fileParseNote, setFileParseNote] = useState("");
  const [fileParseName, setFileParseName] = useState("");
  const [fileParseMode, setFileParseMode] = useState<"merge" | "replace">("merge");
  const [previewRows, setPreviewRows] = useState<ParsedPreviewRow[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [localeRows, setLocaleRows] = useState<Array<{ locale: string; value: string }>>([]);

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
  }, [load]);

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

  const handleCsvImport = async () => {
    if (!csvText.trim()) {
      setError("请粘贴 CSV 内容");
      return;
    }
    setCsvImporting(true);
    setError(null);
    try {
      const res = await fetch(`/api/translate/v4/glossary${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText, mode: csvMode }),
      });
      const payload = (await res.json()) as {
        ok?: boolean;
        imported?: number;
        total?: number;
        error?: string;
      };
      if (!res.ok || !payload.ok) throw new Error(payload.error ?? "导入失败");
      shopify.toast.show(`导入 ${payload.imported ?? 0} 条，共 ${payload.total ?? 0} 条术语`);
      setCsvOpen(false);
      setCsvText("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCsvImporting(false);
    }
  };

  const handleFileSelected = async (file: File) => {
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
    const merged = fileParseMode === "replace" ? selected : mergeTermsClient(terms, selected);
    setTerms(merged);
    setDirty(true);
    setPreviewRows([]);
    setFileParseOpen(false);
    setFileParseName("");
    setFileParseNote("");
    shopify.toast.show(`已将 ${selected.length} 条术语加入术语表，点击「保存术语表」生效`);
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

  return (
    <PageSurface>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: expanded ? "1rem" : 0 }}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
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
          }}
        >
          <span style={{ fontSize: "0.75rem", color: pageColorTokens.textSecondary }}>{expanded ? "▼" : "▶"}</span>
          术语表
          <span style={{ fontWeight: 500, fontSize: "0.8125rem", color: pageColorTokens.textSecondary }}>
            （{terms.length} 条{dirty ? " · 未保存" : ""}）
          </span>
        </button>
        {expanded && (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <s-button type="button" variant="secondary" onClick={() => { setCsvOpen((v) => !v); setFileParseOpen(false); }}>
              {csvOpen ? "关闭 CSV" : "CSV 导入"}
            </s-button>
            <s-button type="button" variant="secondary" onClick={() => { setFileParseOpen((v) => !v); setCsvOpen(false); }}>
              {fileParseOpen ? "关闭文件" : "上传文件"}
            </s-button>
            <s-button type="button" variant="secondary" onClick={addTerm}>
              新增术语
            </s-button>
            <s-button
              type="button"
              variant="primary"
              onClick={handleSave}
              {...(saving || !dirty ? { disabled: true } : {})}
            >
              {saving ? "保存中…" : "保存术语表"}
            </s-button>
          </div>
        )}
      </div>

      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={pageHintTextStyle}>
            品牌名、产品词、固定译法等会在翻译阶段注入 LLM 提示词。保存后 Worker 通常在数秒内生效。
          </div>

          {csvOpen && (
            <div style={pageInnerPanelStyle}>
              <div style={pageFieldLabelStyle}>批量导入 CSV</div>
              <div style={{ ...pageHintTextStyle, marginTop: 0, marginBottom: "0.5rem" }}>
                表头需含 <code>source</code> 列；<code>do_not_translate</code> 填 true 表示不翻译；其余列为语言代码（en、ja 等）。
              </div>
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={CSV_EXAMPLE}
                rows={5}
                style={textareaStyle}
              />
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center", marginTop: "0.5rem" }}>
                <label style={radioLabelStyle}>
                  <input type="radio" name="glossary-csv-mode" checked={csvMode === "merge"} onChange={() => setCsvMode("merge")} />
                  合并（不覆盖已有译法）
                </label>
                <label style={radioLabelStyle}>
                  <input type="radio" name="glossary-csv-mode" checked={csvMode === "replace"} onChange={() => setCsvMode("replace")} />
                  替换全部并保存
                </label>
                <s-button type="button" variant="primary" onClick={handleCsvImport} {...(csvImporting ? { disabled: true } : {})}>
                  {csvImporting ? "导入中…" : "确认导入"}
                </s-button>
              </div>
            </div>
          )}

          {fileParseOpen && (
            <div style={pageInnerPanelStyle}>
              <div style={pageFieldLabelStyle}>上传文件（LLM 解析）</div>
              <div style={{ ...pageHintTextStyle, marginTop: 0, marginBottom: "0.5rem" }}>
                支持 {FILE_TYPES_LABEL}，最大 10 MB。文件内容由 LLM 自动识别术语对照。
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
                {fileParseName && !fileParsing && (
                  <span style={{ fontSize: "0.8125rem", color: pageColorTokens.textSecondary }}>{fileParseName}</span>
                )}
              </div>

              {fileParseNote && previewRows.length > 0 && (
                <div style={{ ...pageHintTextStyle, marginTop: "0.75rem", color: pageColorTokens.textBody }}>
                  {fileParseNote}
                </div>
              )}

              {previewRows.length > 0 && (
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
                      <input type="radio" name="glossary-file-mode" checked={fileParseMode === "merge"} onChange={() => setFileParseMode("merge")} />
                      合并到现有
                    </label>
                    <label style={radioLabelStyle}>
                      <input type="radio" name="glossary-file-mode" checked={fileParseMode === "replace"} onChange={() => setFileParseMode("replace")} />
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
              )}
            </div>
          )}

          {error && <div style={formErrorBoxStyle}>{error}</div>}

          {loading ? (
            <div style={{ fontSize: "0.875rem", color: pageColorTokens.textSecondary }}>加载术语表…</div>
          ) : terms.length === 0 ? (
            <div style={{ fontSize: "0.875rem", color: pageColorTokens.textSecondary }}>
              暂无术语。可新增、CSV 导入，或上传品牌指南 / 术语文档由 LLM 解析。
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {terms.map((term, idx) => (
                <div key={idx} style={termRowStyle}>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1.2fr) auto minmax(140px, 1fr) auto", gap: "0.5rem", alignItems: "center" }}>
                    <input
                      type="text"
                      value={term.source}
                      placeholder="原文术语"
                      onChange={(e) => updateTerm(idx, { source: e.target.value })}
                      style={inputStyle}
                    />
                    <label style={checkboxLabelStyle} title="勾选后所有语言均不翻译">
                      <input
                        type="checkbox"
                        checked={!!term.doNotTranslate}
                        onChange={(e) => updateTerm(idx, { doNotTranslate: e.target.checked || undefined })}
                      />
                      勿译
                    </label>
                    <input
                      type="text"
                      value={term.note ?? ""}
                      placeholder="备注（可选）"
                      onChange={(e) => updateTerm(idx, { note: e.target.value || undefined })}
                      style={inputStyle}
                    />
                    <div style={{ display: "flex", gap: "0.35rem", justifyContent: "flex-end" }}>
                      <button type="button" onClick={() => openTranslationsEditor(idx)} style={linkBtnStyle}>
                        译法
                      </button>
                      <button type="button" onClick={() => deleteTerm(idx)} style={dangerBtnStyle}>
                        删除
                      </button>
                    </div>
                  </div>
                  {!term.doNotTranslate && (
                    <div style={{ fontSize: "0.75rem", color: pageColorTokens.textSecondary, marginTop: "0.35rem" }}>
                      {formatTranslationsSummary(term.translations)}
                    </div>
                  )}
                  {editingIdx === idx && (
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
                        <s-button type="button" variant="secondary" onClick={() => setLocaleRows((prev) => [...prev, { locale: "", value: "" }])}>
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
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </PageSurface>
  );
}

const termRowStyle: CSSProperties = {
  padding: "0.65rem 0.75rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surface,
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

const textareaStyle: CSSProperties = {
  ...inputStyle,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  resize: "vertical",
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
