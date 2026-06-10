import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  Table,
  Select,
  Input,
  Tag,
  Typography,
  Spin,
  Alert,
  Progress,
  Drawer,
  Descriptions,
  Badge,
  Space,
  Button,
  Collapse,
  Tooltip,
  Modal,
  Form,
  Checkbox,
  Popconfirm,
  message,
  Divider,
  Radio,
} from "antd";
import {
  SearchOutlined,
  ReloadOutlined,
  ApiOutlined,
  BookOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartTooltip,
  Legend,
  Area,
  AreaChart,
} from "recharts";
import {
  fetchTranslations,
  fetchTranslationJob,
  fetchLLMKeyStats,
  fetchLLMKeyHistory,
  fetchGlossary,
  saveGlossary,
  importGlossaryCsv,
  parseGlossaryFile,
  type TranslationJob,
  type LLMKeyStats,
  type LLMKeyHistoryEntry,
  type GlossaryTerm,
} from "../api";

const ACTIVE_STATUSES = new Set([
  "INIT_QUEUED",
  "INITIALIZING",
  "INIT_DONE",
  "TRANSLATE_QUEUED",
  "TRANSLATING",
  "TRANSLATE_DONE",
  "WRITEBACK_QUEUED",
  "WRITING_BACK",
  "VERIFY_QUEUED",
  "VERIFYING",
]);

function statusBadge(status: string) {
  if (status === "COMPLETED") return <Badge status="success" text={status} />;
  if (status === "FAILED") return <Badge status="error" text={status} />;
  if (status === "CANCELLED") return <Badge status="default" text={status} />;
  if (status === "PAUSED") return <Badge status="warning" text={status} />;
  if (ACTIVE_STATUSES.has(status))
    return <Badge status="processing" text={status} />;
  return <Badge status="default" text={status} />;
}

function calcProgress(job: TranslationJob): number {
  const m = job.metrics;
  const total = m.translateTotal || m.initTotal;
  if (total === 0) return 0;
  const done = m.translateDone + m.translateFailed;
  return Math.round((done / total) * 100);
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtRpm(remaining: number, limit: number): string {
  if (limit < 0) return "—";
  return `${fmtNum(remaining)} / ${fmtNum(limit)}`;
}

function fmtAgo(epochMs: number): string {
  if (!epochMs) return "—";
  const diff = Math.round((Date.now() - epochMs) / 1_000);
  if (diff < 60) return `${diff}s 前`;
  if (diff < 3600) return `${Math.round(diff / 60)}min 前`;
  return `${Math.round(diff / 3600)}h 前`;
}

// ── LLM Key Stats Panel ───────────────────────────────────────────────────────

// ── History chart for one expanded row ───────────────────────────────────────

function fmtTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

type ChartPoint = {
  time: string;
  calls: number;
  tokens: number;
  latMs: number;
  conc: number;
  rpmPct: number | null;
  tpmPct: number | null;
};

function buildChartData(entries: LLMKeyHistoryEntry[]): ChartPoint[] {
  return entries.map((e) => ({
    time:   fmtTime(e.t),
    calls:  e.dC,
    tokens: e.dT,
    latMs:  e.lat,
    conc:   e.conc,
    rpmPct: e.lR > 0 ? Math.round((e.rR / e.lR) * 100) : null,
    tpmPct: e.lT > 0 ? Math.round((e.rT / e.lT) * 100) : null,
  }));
}

function KeyHistoryCharts({ label }: { label: string }) {
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchLLMKeyHistory(label)
      .then((r) => {
        const entries = r.history[label] ?? [];
        setData(buildChartData(entries));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [label]);

  if (loading) return <Spin size="small" style={{ padding: 16 }} />;
  if (data.length === 0) {
    return (
      <Typography.Text type="secondary" style={{ padding: "8px 16px", display: "block" }}>
        暂无历史数据（翻译任务运行时每 10s 记录一次，保留最近 30 分钟）
      </Typography.Text>
    );
  }

  const hasPct = data.some((d) => d.rpmPct !== null || d.tpmPct !== null);

  return (
    <div style={{ padding: "12px 0", display: "flex", gap: 24, flexWrap: "wrap" }}>

      {/* 吞吐量：每10s 调用次数 + Token */}
      <div style={{ flex: "1 1 340px", minWidth: 280 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
          吞吐量（每 10s）
        </Typography.Text>
        <ResponsiveContainer width="100%" height={140}>
          <ComposedChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis yAxisId="calls" tick={{ fontSize: 10 }} width={28} />
            <YAxis yAxisId="tokens" orientation="right" tick={{ fontSize: 10 }} width={36}
              tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
            <RechartTooltip
              contentStyle={{ fontSize: 12 }}
              formatter={(value: number, name: string) =>
                name === "tokens" ? [`${fmtNum(value)}`, "Token"] : [value, "调用"]}
            />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="calls"  dataKey="calls"  name="调用" fill="#1890ff" opacity={0.7} maxBarSize={12} />
            <Line yAxisId="tokens" dataKey="tokens" name="tokens" stroke="#52c41a" dot={false} strokeWidth={1.5} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 延迟 + 并发 */}
      <div style={{ flex: "1 1 300px", minWidth: 260 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
          延迟 & 并发上限
        </Typography.Text>
        <ResponsiveContainer width="100%" height={140}>
          <ComposedChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis yAxisId="lat"  tick={{ fontSize: 10 }} width={36}
              tickFormatter={(v: number) => `${v}ms`} />
            <YAxis yAxisId="conc" orientation="right" tick={{ fontSize: 10 }} width={24} />
            <RechartTooltip contentStyle={{ fontSize: 12 }}
              formatter={(value: number, name: string) =>
                name === "conc" ? [value, "并发上限"] : [`${value}ms`, "延迟"]} />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            <Line yAxisId="lat"  dataKey="latMs" name="延迟ms" stroke="#fa8c16" dot={false} strokeWidth={1.5} />
            <Line yAxisId="conc" dataKey="conc"  name="conc"   stroke="#722ed1" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 配额余量% — 仅当 provider 返回了限额信息时显示 */}
      {hasPct && (
        <div style={{ flex: "1 1 300px", minWidth: 260 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
            配额余量 %（RPM / TPM）
          </Typography.Text>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} width={28}
                tickFormatter={(v: number) => `${v}%`} />
              <RechartTooltip contentStyle={{ fontSize: 12 }}
                formatter={(value: string | number, name: string) =>
                  value == null ? ["—", name] : [`${value}%`, name]} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              {data.some((d) => d.rpmPct !== null) && (
                <Area dataKey="rpmPct" name="RPM%" stroke="#1890ff" fill="#e6f7ff"
                  strokeWidth={1.5} dot={false} connectNulls />
              )}
              {data.some((d) => d.tpmPct !== null) && (
                <Area dataKey="tpmPct" name="TPM%" stroke="#52c41a" fill="#f6ffed"
                  strokeWidth={1.5} dot={false} connectNulls />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Glossary Panel ────────────────────────────────────────────────────────────

/** Client-side merge: imported terms add new locales without overwriting existing ones. */
function mergeTermsClient(existing: GlossaryTerm[], imported: GlossaryTerm[]): GlossaryTerm[] {
  const map = new Map(existing.map((t) => [t.source, { ...t }]));
  for (const imp of imported) {
    const ex = map.get(imp.source);
    if (!ex) {
      map.set(imp.source, imp);
    } else {
      if (imp.translations) ex.translations = { ...imp.translations, ...ex.translations };
      if (!ex.note && imp.note) ex.note = imp.note;
      if (!ex.doNotTranslate && imp.doNotTranslate) ex.doNotTranslate = true;
    }
  }
  return [...map.values()];
}

/** Compact display of a term's translations map, e.g. "en: Flash Sale, pl: …" */
function TranslationsSummary({ translations }: { translations?: Record<string, string> }) {
  if (!translations || Object.keys(translations).length === 0) {
    return <Typography.Text type="secondary">—</Typography.Text>;
  }
  return (
    <Typography.Text style={{ fontSize: 12 }}>
      {Object.entries(translations).map(([loc, val]) => `${loc}: ${val}`).join(" · ")}
    </Typography.Text>
  );
}

/** Modal for editing the translations of a single term (dynamic locale rows). */
function TranslationsModal({
  open,
  term,
  onSave,
  onCancel,
}: {
  open: boolean;
  term: GlossaryTerm | null;
  onSave: (translations: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<Array<{ locale: string; value: string }>>([]);

  useEffect(() => {
    if (open && term) {
      const entries = Object.entries(term.translations ?? {});
      setRows(entries.length ? entries.map(([locale, value]) => ({ locale, value })) : [{ locale: "", value: "" }]);
    }
  }, [open, term]);

  const setRow = (i: number, field: "locale" | "value", val: string) => {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  };

  const handleSave = () => {
    const result: Record<string, string> = {};
    for (const row of rows) {
      const k = row.locale.trim().toLowerCase();
      const v = row.value.trim();
      if (k && v) result[k] = v;
    }
    onSave(result);
  };

  return (
    <Modal
      title={`编辑翻译对照：「${term?.source ?? ""}」`}
      open={open}
      onOk={handleSave}
      onCancel={onCancel}
      okText="保存"
      cancelText="取消"
      width={500}
    >
      <div style={{ marginBottom: 8, color: "#888", fontSize: 12 }}>
        语言代码格式：en · zh-CN · pl · fr · de · ja · ko…
      </div>
      {rows.map((row, i) => (
        <Space key={i} style={{ display: "flex", marginBottom: 6 }} align="baseline">
          <Input
            placeholder="语言代码"
            value={row.locale}
            onChange={(e) => setRow(i, "locale", e.target.value)}
            style={{ width: 100 }}
          />
          <Input
            placeholder="对应翻译"
            value={row.value}
            onChange={(e) => setRow(i, "value", e.target.value)}
            style={{ width: 260 }}
          />
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            size="small"
            onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
          />
        </Space>
      ))}
      <Button
        type="dashed"
        size="small"
        icon={<PlusOutlined />}
        onClick={() => setRows((prev) => [...prev, { locale: "", value: "" }])}
        style={{ marginTop: 4 }}
      >
        添加语言
      </Button>
    </Modal>
  );
}

/** Modal for CSV bulk import. */
function CsvImportModal({
  open,
  shopName,
  onSuccess,
  onCancel,
}: {
  open: boolean;
  shopName: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [csv, setCsv] = useState("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [loading, setLoading] = useState(false);

  const CSV_EXAMPLE = `source,do_not_translate,note,en,zh-CN,pl,fr
闪购,,,Flash Sale,,,Vente flash
Acme,true,品牌名,,,,,`;

  const handleImport = async () => {
    if (!csv.trim()) { message.warning("请粘贴 CSV 内容"); return; }
    setLoading(true);
    try {
      const r = await importGlossaryCsv(shopName, csv, mode);
      message.success(`导入成功：${r.imported} 条，共 ${r.total} 条术语`);
      onSuccess();
    } catch (e) {
      message.error(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="批量导入 CSV"
      open={open}
      onOk={handleImport}
      onCancel={onCancel}
      confirmLoading={loading}
      okText="导入"
      cancelText="取消"
      width={640}
    >
      <Typography.Paragraph style={{ fontSize: 12, color: "#888", margin: "0 0 8px" }}>
        CSV 格式：第一行为表头（必须含 <code>source</code> 列），之后每行一条术语。
        <code>do_not_translate</code> 列填 <code>true</code> 表示不翻译，其余列为语言代码。
      </Typography.Paragraph>
      <Input.TextArea
        rows={5}
        placeholder={CSV_EXAMPLE}
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        style={{ fontFamily: "monospace", fontSize: 12, marginBottom: 12 }}
      />
      <Space>
        <span style={{ fontSize: 13 }}>导入模式：</span>
        <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
          <Radio value="merge">合并（新术语补充，现有术语不被覆盖）</Radio>
          <Radio value="replace">替换（清空现有全部术语）</Radio>
        </Radio.Group>
      </Space>
      <Divider style={{ margin: "12px 0 8px" }} />
      <div style={{ fontSize: 12, color: "#888" }}>
        格式示例：
        <pre style={{ background: "#f5f5f5", padding: "6px 8px", borderRadius: 4, marginTop: 4, fontSize: 11 }}>
          {CSV_EXAMPLE}
        </pre>
      </div>
    </Modal>
  );
}

// ── File-parse preview Modal ──────────────────────────────────────────────────
//
// Upload any supported file → LLM extracts terms → user reviews + confirms

const SUPPORTED_EXTS = ".xlsx,.xls,.docx,.pdf,.txt,.csv,.json";

function FileParseModal({
  open,
  shopName,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  shopName: string;
  onConfirm: (terms: GlossaryTerm[], mode: "merge" | "replace") => void;
  onCancel: () => void;
}) {
  type ParsedRow = GlossaryTerm & { _selected: boolean; _key: number };

  const [step, setStep] = useState<"upload" | "preview">("upload");
  const [parsing, setParsing] = useState(false);
  const [parseNote, setParseNote] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset when modal opens
  useEffect(() => {
    if (open) { setStep("upload"); setRows([]); setParseNote(""); setFileName(""); }
  }, [open]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParsing(true);
    setStep("preview");
    try {
      const result = await parseGlossaryFile(shopName, file);
      const mapped: ParsedRow[] = result.terms.map((t, i) => ({ ...t, _selected: true, _key: i }));
      setRows(mapped);
      setParseNote(
        result.note ??
        `LLM 从「${result.source}」中识别出 ${result.count} 条术语，请检查后确认添加`,
      );
    } catch (err) {
      message.error(String(err));
      setStep("upload");
    } finally {
      setParsing(false);
      // Reset file input so the same file can be re-uploaded
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const toggleAll = (checked: boolean) =>
    setRows((prev) => prev.map((r) => ({ ...r, _selected: checked })));

  const toggleRow = (key: number, checked: boolean) =>
    setRows((prev) => prev.map((r) => r._key === key ? { ...r, _selected: checked } : r));

  const updateRow = (key: number, patch: Partial<GlossaryTerm>) =>
    setRows((prev) => prev.map((r) => r._key === key ? { ...r, ...patch } : r));

  const handleConfirm = () => {
    const selected = rows
      .filter((r) => r._selected)
      .map(({ _selected: _s, _key: _k, ...term }) => term);
    if (selected.length === 0) { message.warning("请至少选择一条术语"); return; }
    onConfirm(selected, mode);
  };

  const allSelected = rows.length > 0 && rows.every((r) => r._selected);
  const selectedCount = rows.filter((r) => r._selected).length;

  const previewColumns = [
    {
      title: (
        <Checkbox
          checked={allSelected}
          indeterminate={selectedCount > 0 && !allSelected}
          onChange={(e) => toggleAll(e.target.checked)}
        />
      ),
      key: "sel",
      width: 40,
      render: (_: unknown, row: ParsedRow) => (
        <Checkbox checked={row._selected} onChange={(e) => toggleRow(row._key, e.target.checked)} />
      ),
    },
    {
      title: "原文术语",
      dataIndex: "source",
      key: "source",
      width: 180,
      render: (val: string, row: ParsedRow) => (
        <Input
          value={val}
          size="small"
          onChange={(e) => updateRow(row._key, { source: e.target.value })}
          style={{ fontSize: 12 }}
        />
      ),
    },
    {
      title: "勿翻译",
      dataIndex: "doNotTranslate",
      key: "dnt",
      width: 60,
      align: "center" as const,
      render: (val: boolean | undefined, row: ParsedRow) => (
        <Checkbox
          checked={!!val}
          onChange={(e) => updateRow(row._key, { doNotTranslate: e.target.checked || undefined })}
        />
      ),
    },
    {
      title: "备注",
      dataIndex: "note",
      key: "note",
      width: 120,
      render: (val: string | undefined, row: ParsedRow) => (
        <Input
          value={val ?? ""}
          size="small"
          placeholder="—"
          onChange={(e) => updateRow(row._key, { note: e.target.value || undefined })}
          style={{ fontSize: 12 }}
        />
      ),
    },
    {
      title: "翻译对照",
      key: "tr",
      render: (_: unknown, row: ParsedRow) => (
        <TranslationsSummary translations={row.translations} />
      ),
    },
    {
      key: "del",
      width: 36,
      render: (_: unknown, row: ParsedRow) => (
        <Button
          type="text"
          danger
          size="small"
          icon={<DeleteOutlined />}
          onClick={() => setRows((prev) => prev.filter((r) => r._key !== row._key))}
        />
      ),
    },
  ];

  return (
    <Modal
      title="从文件解析术语表"
      open={open}
      onCancel={onCancel}
      width={780}
      footer={
        step === "preview" && !parsing ? (
          <Space style={{ width: "100%", justifyContent: "space-between" }}>
            <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)} size="small">
              <Radio value="merge">合并到现有（已有术语不覆盖）</Radio>
              <Radio value="replace">替换全部</Radio>
            </Radio.Group>
            <Space>
              <Button onClick={onCancel}>取消</Button>
              <Button type="primary" onClick={handleConfirm} disabled={selectedCount === 0}>
                确认添加 {selectedCount > 0 ? `(${selectedCount} 条)` : ""}
              </Button>
            </Space>
          </Space>
        ) : (
          <Button onClick={onCancel}>取消</Button>
        )
      }
    >
      {/* Upload step */}
      {step === "upload" && (
        <div style={{ textAlign: "center", padding: "32px 0" }}>
          <div style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>
            支持格式：<code>.xlsx</code> · <code>.docx</code> · <code>.pdf</code> · <code>.txt</code> · <code>.csv</code>
            <br />
            <span style={{ fontSize: 12, color: "#aaa" }}>
              文件内容由 LLM 自动识别术语对照，最大 10 MB
            </span>
          </div>
          <Button
            icon={<UploadOutlined />}
            size="large"
            type="dashed"
            onClick={() => fileRef.current?.click()}
          >
            点击选择文件
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept={SUPPORTED_EXTS}
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
        </div>
      )}

      {/* Parsing in progress */}
      {step === "preview" && parsing && (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <Spin size="large" />
          <div style={{ marginTop: 16, color: "#666" }}>
            正在解析「{fileName}」，LLM 提取术语中…
          </div>
        </div>
      )}

      {/* Preview table */}
      {step === "preview" && !parsing && (
        <>
          {parseNote && (
            <Alert
              type="info"
              message={parseNote}
              showIcon
              style={{ marginBottom: 12 }}
              action={
                <Button size="small" onClick={() => { setStep("upload"); setRows([]); }}>
                  重新上传
                </Button>
              }
            />
          )}
          <Table
            dataSource={rows}
            columns={previewColumns}
            rowKey="_key"
            size="small"
            pagination={false}
            scroll={{ y: 360, x: true }}
          />
          <div style={{ marginTop: 8, fontSize: 12, color: "#aaa" }}>
            可直接在表格里修改 / 取消勾选不需要的术语，确认后再保存。
          </div>
        </>
      )}
    </Modal>
  );
}

function GlossaryPanel() {
  const [shopInput, setShopInput] = useState("");
  const [shopName, setShopName] = useState("");
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingTerm, setEditingTerm] = useState<GlossaryTerm | null>(null);
  const [editingIdx, setEditingIdx] = useState<number>(-1);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [fileParseOpen, setFileParseOpen] = useState(false);

  const load = useCallback(async (shop: string) => {
    if (!shop) return;
    setLoading(true);
    try {
      const r = await fetchGlossary(shop);
      setTerms(r.terms);
      setDirty(false);
      if (r.note) message.info(r.note);
    } catch (e) {
      message.error(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLoad = () => {
    const s = shopInput.trim();
    if (!s) { message.warning("请输入店铺名称"); return; }
    setShopName(s);
    load(s);
  };

  const handleSave = async () => {
    if (!shopName) return;
    setSaving(true);
    try {
      const r = await saveGlossary(shopName, terms);
      message.success(`已保存 ${r.count} 条术语`);
      setDirty(false);
    } catch (e) {
      message.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  const updateTerm = (idx: number, patch: Partial<GlossaryTerm>) => {
    setTerms((prev) => prev.map((t, i) => i === idx ? { ...t, ...patch } : t));
    setDirty(true);
  };

  const deleteTerm = (idx: number) => {
    setTerms((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const addTerm = () => {
    setTerms((prev) => [...prev, { source: "" }]);
    setDirty(true);
  };

  const handleFileParsed = async (parsed: GlossaryTerm[], mode: "merge" | "replace") => {
    const merged = mode === "replace" ? parsed : mergeTermsClient(terms, parsed);
    setTerms(merged);
    setDirty(true);
    setFileParseOpen(false);
    message.success(`已将 ${parsed.length} 条术语${mode === "replace" ? "替换" : "合并"}到术语表，点击保存生效`);
  };

  const openTranslationsEditor = (idx: number) => {
    setEditingIdx(idx);
    setEditingTerm(terms[idx]);
  };

  const saveTranslations = (translations: Record<string, string>) => {
    if (editingIdx >= 0) {
      updateTerm(editingIdx, { translations: Object.keys(translations).length ? translations : undefined });
    }
    setEditingIdx(-1);
    setEditingTerm(null);
  };

  const columns = [
    {
      title: "原文术语",
      dataIndex: "source",
      key: "source",
      width: 200,
      render: (val: string, _: GlossaryTerm, idx: number) => (
        <Input
          value={val}
          size="small"
          placeholder="输入术语"
          onChange={(e) => updateTerm(idx, { source: e.target.value })}
          style={{ fontSize: 13 }}
        />
      ),
    },
    {
      title: "勿翻译",
      dataIndex: "doNotTranslate",
      key: "doNotTranslate",
      width: 72,
      align: "center" as const,
      render: (val: boolean | undefined, _: GlossaryTerm, idx: number) => (
        <Checkbox
          checked={!!val}
          onChange={(e) => updateTerm(idx, { doNotTranslate: e.target.checked || undefined })}
        />
      ),
    },
    {
      title: "备注",
      dataIndex: "note",
      key: "note",
      width: 140,
      render: (val: string | undefined, _: GlossaryTerm, idx: number) => (
        <Input
          value={val ?? ""}
          size="small"
          placeholder="品牌名/说明"
          onChange={(e) => updateTerm(idx, { note: e.target.value || undefined })}
          style={{ fontSize: 12 }}
        />
      ),
    },
    {
      title: "翻译对照",
      key: "translations",
      render: (_: unknown, term: GlossaryTerm, idx: number) => (
        <Space size={4}>
          <TranslationsSummary translations={term.translations} />
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openTranslationsEditor(idx)}
            style={{ padding: "0 4px" }}
          >
            编辑
          </Button>
        </Space>
      ),
    },
    {
      title: "",
      key: "actions",
      width: 48,
      render: (_: unknown, __: GlossaryTerm, idx: number) => (
        <Popconfirm
          title="删除此术语？"
          onConfirm={() => deleteTerm(idx)}
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <Button type="text" danger icon={<DeleteOutlined />} size="small" />
        </Popconfirm>
      ),
    },
  ];

  return (
    <Collapse
      style={{ marginBottom: 16 }}
      items={[{
        key: "glossary",
        label: (
          <Space>
            <BookOutlined />
            <span>术语表管理</span>
            {shopName && terms.length > 0 && (
              <Tag color="blue">{shopName} · {terms.length} 条</Tag>
            )}
            {dirty && <Tag color="orange">未保存</Tag>}
          </Space>
        ),
        children: (
          <Spin spinning={loading}>
            {/* Shop selector */}
            <Space style={{ marginBottom: 16 }}>
              <Input
                placeholder="店铺名称 (shopName)"
                value={shopInput}
                onChange={(e) => setShopInput(e.target.value)}
                onPressEnter={handleLoad}
                style={{ width: 260 }}
              />
              <Button onClick={handleLoad}>加载</Button>
            </Space>

            {shopName && (
              <>
                <Table
                  dataSource={terms}
                  columns={columns}
                  rowKey={(_, idx) => String(idx)}
                  size="small"
                  pagination={false}
                  scroll={{ x: true }}
                  style={{ marginBottom: 12 }}
                  locale={{ emptyText: '暂无术语，点击"新增"添加' }}
                />
                <Space>
                  <Button icon={<PlusOutlined />} size="small" onClick={addTerm}>
                    新增术语
                  </Button>
                  <Button icon={<UploadOutlined />} size="small" onClick={() => setCsvModalOpen(true)}>
                    导入 CSV
                  </Button>
                  <Button icon={<UploadOutlined />} size="small" onClick={() => setFileParseOpen(true)}>
                    上传文件（LLM 解析）
                  </Button>
                  <Button
                    type="primary"
                    size="small"
                    loading={saving}
                    disabled={!dirty}
                    onClick={handleSave}
                  >
                    保存术语表
                  </Button>
                  {dirty && (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      有未保存的改动
                    </Typography.Text>
                  )}
                </Space>

                <div style={{ marginTop: 8, fontSize: 12, color: "#aaa" }}>
                  保存后 Worker 在数秒内生效（Redis 版本缓存失效）。术语注入到每次翻译的 system prompt 中。
                </div>

                {/* Modals rendered inside the guarded shopName block */}
                <TranslationsModal
                  open={editingIdx >= 0}
                  term={editingTerm}
                  onSave={saveTranslations}
                  onCancel={() => { setEditingIdx(-1); setEditingTerm(null); }}
                />
                <CsvImportModal
                  open={csvModalOpen}
                  shopName={shopName}
                  onSuccess={() => { setCsvModalOpen(false); load(shopName); }}
                  onCancel={() => setCsvModalOpen(false)}
                />
                <FileParseModal
                  open={fileParseOpen}
                  shopName={shopName}
                  onConfirm={handleFileParsed}
                  onCancel={() => setFileParseOpen(false)}
                />
              </>
            )}
          </Spin>
        ),
      }]}
    />
  );
}

// ── LLM Key Stats Panel ───────────────────────────────────────────────────────

function LLMKeyStatsPanel() {
  const [stats, setStats] = useState<LLMKeyStats[]>([]);
  const [note, setNote] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    fetchLLMKeyStats()
      .then((r) => {
        setStats(r.stats);
        setNote(r.note ?? "");
        setLastFetch(Date.now());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const columns = [
    {
      title: "Key",
      dataIndex: "label",
      key: "label",
      render: (v: string) => (
        <Typography.Text code style={{ fontSize: 12 }}>{v}</Typography.Text>
      ),
    },
    {
      title: "调用次数",
      dataIndex: "calls",
      key: "calls",
      render: (v: number) => fmtNum(v),
      sorter: (a: LLMKeyStats, b: LLMKeyStats) => a.calls - b.calls,
    },
    {
      title: "Token 消耗",
      dataIndex: "tokens",
      key: "tokens",
      render: (v: number) => fmtNum(v),
      sorter: (a: LLMKeyStats, b: LLMKeyStats) => a.tokens - b.tokens,
    },
    {
      title: "平均延迟",
      dataIndex: "avgLatencyMs",
      key: "avgLatencyMs",
      render: (v: number) => v > 0 ? `${v}ms` : "—",
    },
    {
      title: (
        <Tooltip title="并发上限由 AdaptiveSemaphore 根据 X-RateLimit 响应头实时计算，所有 key 共享">
          并发上限
        </Tooltip>
      ),
      dataIndex: "poolConcurrency",
      key: "poolConcurrency",
      render: (v: number) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: (
        <Tooltip title="RPM 剩余 / 上限（-1 表示 provider 未返回）">
          RPM 剩余/上限
        </Tooltip>
      ),
      key: "rpm",
      render: (_: unknown, r: LLMKeyStats) => (
        <Typography.Text
          type={r.remainingReq >= 0 && r.limitReq > 0 && r.remainingReq < r.limitReq * 0.2
            ? "danger" : undefined}
          style={{ fontSize: 12 }}
        >
          {fmtRpm(r.remainingReq, r.limitReq)}
        </Typography.Text>
      ),
    },
    {
      title: (
        <Tooltip title="TPM 剩余 / 上限（-1 表示 provider 未返回）">
          TPM 剩余/上限
        </Tooltip>
      ),
      key: "tpm",
      render: (_: unknown, r: LLMKeyStats) => (
        <Typography.Text
          type={r.remainingTok >= 0 && r.limitTok > 0 && r.remainingTok < r.limitTok * 0.2
            ? "danger" : undefined}
          style={{ fontSize: 12 }}
        >
          {fmtRpm(r.remainingTok, r.limitTok)}
        </Typography.Text>
      ),
    },
    {
      title: "限流次数",
      dataIndex: "throttleCount",
      key: "throttleCount",
      render: (v: number) => v > 0
        ? <Typography.Text type="warning">{v}</Typography.Text>
        : <Typography.Text type="secondary">0</Typography.Text>,
    },
    {
      title: "错误数",
      dataIndex: "errors",
      key: "errors",
      render: (v: number) => v > 0
        ? <Typography.Text type="danger">{v}</Typography.Text>
        : <Typography.Text type="secondary">0</Typography.Text>,
    },
    {
      title: "最后更新",
      dataIndex: "updatedAt",
      key: "updatedAt",
      render: (v: number) => (
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>{fmtAgo(v)}</Typography.Text>
      ),
    },
  ];

  const headerExtra = (
    <Space size={8}>
      {lastFetch > 0 && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Worker 每 10s 写入一次
        </Typography.Text>
      )}
      <Button
        size="small"
        icon={<ReloadOutlined />}
        loading={loading}
        onClick={(e) => { e.stopPropagation(); load(); }}
      >
        刷新
      </Button>
    </Space>
  );

  return (
    <Collapse
      style={{ marginBottom: 16 }}
      items={[
        {
          key: "llm-keys",
          label: (
            <Space>
              <ApiOutlined />
              <span>LLM Key 调用情况</span>
              {stats.length > 0 && (
                <Tag color="processing">{stats.length} 个 Key</Tag>
              )}
            </Space>
          ),
          extra: headerExtra,
          children: (
            <Spin spinning={loading}>
              {note && (
                <Alert type="warning" message={note} style={{ marginBottom: 8 }} showIcon />
              )}
              {stats.length === 0 && !loading ? (
                <Typography.Text type="secondary">
                  暂无数据（翻译任务运行时会自动上报）
                </Typography.Text>
              ) : (
                <Table
                  dataSource={stats}
                  columns={columns}
                  rowKey="label"
                  size="small"
                  pagination={false}
                  scroll={{ x: true }}
                  expandable={{
                    expandedRowRender: (row: LLMKeyStats) => (
                      <KeyHistoryCharts label={row.label} />
                    ),
                    rowExpandable: () => true,
                    expandRowByClick: false,
                  }}
                />
              )}
            </Spin>
          ),
        },
      ]}
    />
  );
}

export default function Translations() {
  const [jobs, setJobs] = useState<TranslationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorLevel, setErrorLevel] = useState<"error" | "warning">("error");
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [shopFilter, setShopFilter] = useState("");
  const [selected, setSelected] = useState<TranslationJob | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetchTranslations({
      status: statusFilter,
      shop: shopFilter || undefined,
      limit: 200,
    })
      .then((r) => {
        setJobs(r.jobs);
        if ((r as { note?: string }).note) {
          setError((r as { note?: string }).note!);
          setErrorLevel("warning");
        }
      })
      .catch((e) => { setError(String(e)); setErrorLevel("error"); })
      .finally(() => setLoading(false));
  }, [statusFilter, shopFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh active jobs every 15s
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  function openDetail(job: TranslationJob) {
    setSelected(job);
    setDetailLoading(true);
    fetchTranslationJob(job.id, job.shopName)
      .then((r) => setSelected(r.job))
      .finally(() => setDetailLoading(false));
  }

  const columns = [
    {
      title: "商店",
      dataIndex: "shopName",
      key: "shopName",
      render: (v: string) => (
        <Typography.Text style={{ fontSize: 12 }}>{v}</Typography.Text>
      ),
    },
    {
      title: "语言对",
      key: "lang",
      render: (_: unknown, r: TranslationJob) => (
        <Tag>
          {r.source} → {r.target}
        </Tag>
      ),
    },
    {
      title: "模块",
      dataIndex: "modules",
      key: "modules",
      render: (v: string[]) => (
        <Space size={2} wrap>
          {v.map((m) => (
            <Tag key={m} style={{ fontSize: 10, margin: 0 }}>
              {m}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (v: string) => statusBadge(v),
    },
    {
      title: "进度",
      key: "progress",
      width: 120,
      render: (_: unknown, r: TranslationJob) => {
        const pct = calcProgress(r);
        const status = r.status === "FAILED" ? "exception" : r.status === "COMPLETED" ? "success" : "active";
        return <Progress percent={pct} size="small" status={status} />;
      },
    },
    {
      title: "失败数",
      key: "failed",
      render: (_: unknown, r: TranslationJob) => {
        const failed = r.metrics.translateFailed;
        return failed > 0 ? (
          <Typography.Text type="danger">{failed}</Typography.Text>
        ) : (
          <Typography.Text type="secondary">0</Typography.Text>
        );
      },
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (v: string) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {new Date(v).toLocaleString("zh-CN")}
        </Typography.Text>
      ),
    },
    {
      title: "操作",
      key: "action",
      render: (_: unknown, r: TranslationJob) => (
        <Button type="link" size="small" onClick={() => openDetail(r)}>
          详情
        </Button>
      ),
    },
  ];

  const stuckJobs = useMemo(() => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    return jobs.filter(
      (j) => ACTIVE_STATUSES.has(j.status) && new Date(j.updatedAt).getTime() < cutoff,
    );
  }, [jobs]);

  if (error && errorLevel === "error") return <Alert type="error" message={error} />;

  return (
    <div>
      <GlossaryPanel />
      <LLMKeyStatsPanel />

      {error && errorLevel === "warning" && (
        <Alert type="warning" message={error} style={{ marginBottom: 16 }} showIcon />
      )}
      {stuckJobs.length > 0 && (        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={`发现 ${stuckJobs.length} 个卡住的任务（超过 1 小时未更新）`}
          description={
            <ul style={{ margin: "4px 0 0 0", paddingLeft: 16 }}>
              {stuckJobs.map((j) => (
                <li key={j.id} style={{ fontSize: 12 }}>
                  <strong>{j.shopName}</strong> — {j.source}→{j.target} — 状态: {j.status} — 最后更新:{" "}
                  {new Date(j.updatedAt).toLocaleString("zh-CN")}
                </li>
              ))}
            </ul>
          }
        />
      )}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <Typography.Title level={4} style={{ margin: 0 }}>
          翻译任务
        </Typography.Title>
        <Select
          allowClear
          placeholder="按状态筛选"
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 180 }}
          options={[
            { value: "COMPLETED", label: "已完成" },
            { value: "FAILED", label: "已失败" },
            { value: "TRANSLATING", label: "翻译中" },
            { value: "INITIALIZING", label: "初始化中" },
            { value: "PAUSED", label: "已暂停" },
            { value: "CANCELLED", label: "已取消" },
          ]}
        />
        <Input
          prefix={<SearchOutlined />}
          placeholder="按商店过滤"
          value={shopFilter}
          onChange={(e) => setShopFilter(e.target.value)}
          style={{ width: 220 }}
          allowClear
        />
        <Button icon={<ReloadOutlined />} onClick={load}>
          刷新
        </Button>
        <Button
          type={autoRefresh ? "primary" : "default"}
          onClick={() => setAutoRefresh((v) => !v)}
        >
          {autoRefresh ? "关闭自动刷新" : "开启自动刷新 (15s)"}
        </Button>
      </div>

      <Spin spinning={loading}>
        <Table
          dataSource={jobs}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 20 }}
        />
      </Spin>

      <Drawer
        title="翻译任务详情"
        open={!!selected}
        onClose={() => setSelected(null)}
        width={600}
      >
        {detailLoading ? (
          <Spin />
        ) : selected ? (
          <div>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="任务 ID">
                <Typography.Text copyable style={{ fontSize: 12 }}>
                  {selected.id}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="商店">
                {selected.shopName}
              </Descriptions.Item>
              <Descriptions.Item label="语言对">
                {selected.source} → {selected.target}
              </Descriptions.Item>
              <Descriptions.Item label="模块">
                {selected.modules.join(", ")}
              </Descriptions.Item>
              <Descriptions.Item label="AI 模型">
                <Tag>{selected.aiModel}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                {statusBadge(selected.status)}
              </Descriptions.Item>
              <Descriptions.Item label="Worker">
                {selected.claimedBy ?? "-"}
              </Descriptions.Item>
            </Descriptions>

            <Typography.Title level={5} style={{ marginTop: 24 }}>
              进度指标
            </Typography.Title>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="初始化">
                {selected.metrics.initDone} / {selected.metrics.initTotal}
              </Descriptions.Item>
              <Descriptions.Item label="翻译">
                {selected.metrics.translateDone} /{" "}
                {selected.metrics.translateTotal}
              </Descriptions.Item>
              <Descriptions.Item label="翻译失败">
                <Typography.Text
                  type={
                    selected.metrics.translateFailed > 0 ? "danger" : undefined
                  }
                >
                  {selected.metrics.translateFailed}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="写回">
                {selected.metrics.writebackDone} /{" "}
                {selected.metrics.writebackTotal}
              </Descriptions.Item>
              <Descriptions.Item label="写回失败">
                <Typography.Text
                  type={
                    selected.metrics.writebackFailed > 0 ? "danger" : undefined
                  }
                >
                  {selected.metrics.writebackFailed}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="消耗 Tokens">
                {selected.metrics.usedTokens.toLocaleString()}
              </Descriptions.Item>
            </Descriptions>

            {selected.errorMessage && (
              <Alert
                type="error"
                message={`失败阶段: ${selected.errorStage ?? "未知"}`}
                description={selected.errorMessage}
                style={{ marginTop: 16 }}
                showIcon
              />
            )}

            <Descriptions column={1} bordered size="small" style={{ marginTop: 16 }}>
              <Descriptions.Item label="创建时间">
                {new Date(selected.createdAt).toLocaleString("zh-CN")}
              </Descriptions.Item>
              <Descriptions.Item label="更新时间">
                {new Date(selected.updatedAt).toLocaleString("zh-CN")}
              </Descriptions.Item>
            </Descriptions>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
