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
  message,
  Modal,
  Form,
  Checkbox,
  Popconfirm,
  Divider,
  Radio,
  Upload,
} from "antd";
import type { UploadFile } from "antd";
import {
  SearchOutlined,
  ReloadOutlined,
  ApiOutlined,
  BookOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  UploadOutlined,
  ScanOutlined,
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
  triggerShopAnalysis,
  fetchAnalysisStatus,
  fetchShopProfile,
  saveShopProfile,
  fetchGlossaryDraft,
  approveGlossaryDraft,
  type TranslationJob,
  type LLMKeyStats,
  type LLMKeyHistoryEntry,
  type GlossaryTerm,
  type ShopAnalysisJob,
  type ShopProfile,
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

// ── Glossary Panel ────────────────────────────────────────────────────────────

function mergeTermsClient(existing: GlossaryTerm[], incoming: GlossaryTerm[]): GlossaryTerm[] {
  const map = new Map(existing.map((t) => [t.source, { ...t }]));
  for (const inc of incoming) {
    const ex = map.get(inc.source);
    if (!ex) { map.set(inc.source, inc); continue; }
    if (inc.translations) ex.translations = { ...inc.translations, ...ex.translations };
    if (!ex.note && inc.note) ex.note = inc.note;
    if (inc.doNotTranslate) ex.doNotTranslate = true;
  }
  return [...map.values()];
}

function GlossaryPanel() {
  const [shopName, setShopName] = useState("");
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Add/Edit term modal
  const [editModal, setEditModal] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editForm] = Form.useForm();

  // CSV import modal
  const [csvModal, setCsvModal] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvMode, setCsvMode] = useState<"merge" | "replace">("merge");
  const [csvImporting, setCsvImporting] = useState(false);

  // File parse modal
  const [parseModal, setParseModal] = useState(false);
  const [parseFile, setParseFile] = useState<UploadFile | null>(null);
  const [parsePending, setParsePending] = useState<GlossaryTerm[]>([]);
  const [parsePendingSelected, setParsePendingSelected] = useState<string[]>([]);
  const [parsePendingMode, setParsePendingMode] = useState<"merge" | "replace">("merge");
  const [parsing, setParsing] = useState(false);
  const [parseSaving, setParseSaving] = useState(false);

  function loadGlossary() {
    if (!shopName.trim()) { message.warning("请输入商店域名"); return; }
    setLoading(true);
    fetchGlossary(shopName)
      .then((r) => { setTerms(r.terms ?? []); setLoaded(true); })
      .catch((e: unknown) => message.error(String(e)))
      .finally(() => setLoading(false));
  }

  async function handleSave(newTerms: GlossaryTerm[]) {
    setSaving(true);
    try {
      await saveGlossary(shopName, newTerms);
      setTerms(newTerms);
      message.success("术语表已保存");
    } catch (e) {
      message.error(String(e));
    } finally {
      setSaving(false);
    }
  }

  function openAdd() {
    setEditIndex(null);
    editForm.resetFields();
    setEditModal(true);
  }

  function openEdit(idx: number) {
    const t = terms[idx];
    setEditIndex(idx);
    editForm.setFieldsValue({
      source: t.source,
      doNotTranslate: t.doNotTranslate ?? false,
      note: t.note ?? "",
      translationsStr: Object.entries(t.translations ?? {})
        .map(([k, v]) => `${k}=${v}`)
        .join("\n"),
    });
    setEditModal(true);
  }

  function handleEditOk() {
    editForm.validateFields().then((vals) => {
      const translations: Record<string, string> = {};
      for (const line of (vals.translationsStr as string).split("\n")) {
        const eq = line.indexOf("=");
        if (eq > 0) translations[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
      }
      const term: GlossaryTerm = {
        source: (vals.source as string).trim(),
        doNotTranslate: vals.doNotTranslate as boolean || false,
        note: (vals.note as string).trim() || undefined,
        translations: Object.keys(translations).length ? translations : undefined,
      };
      let newTerms: GlossaryTerm[];
      if (editIndex === null) {
        newTerms = [...terms, term];
      } else {
        newTerms = terms.map((t, i) => (i === editIndex ? term : t));
      }
      handleSave(newTerms);
      setEditModal(false);
    });
  }

  function handleDelete(idx: number) {
    handleSave(terms.filter((_, i) => i !== idx));
  }

  async function handleCsvImport() {
    if (!csvText.trim()) { message.warning("请输入 CSV 内容"); return; }
    setCsvImporting(true);
    try {
      const r = await importGlossaryCsv(shopName, csvText, csvMode);
      message.success(`已导入 ${r.total} 条术语（${r.mode}）`);
      setCsvModal(false);
      setCsvText("");
      loadGlossary();
    } catch (e) {
      message.error(String(e));
    } finally {
      setCsvImporting(false);
    }
  }

  async function handleFileParse() {
    if (!parseFile) { message.warning("请选择文件"); return; }
    const file = parseFile.originFileObj as File;
    if (!file) { message.warning("文件读取失败"); return; }
    setParsing(true);
    try {
      const r = await parseGlossaryFile(shopName, file);
      setParsePending(r.terms);
      setParsePendingSelected(r.terms.map((t) => t.source));
      if (r.truncated) message.warning("文件较大，已截断后解析");
    } catch (e) {
      message.error(String(e));
    } finally {
      setParsing(false);
    }
  }

  async function handleParseConfirm() {
    const selected = parsePending.filter((t) => parsePendingSelected.includes(t.source));
    if (!selected.length) { message.warning("请至少选择一条词条"); return; }
    setParseSaving(true);
    try {
      let newTerms: GlossaryTerm[];
      if (parsePendingMode === "replace") {
        newTerms = selected;
      } else {
        newTerms = mergeTermsClient(terms, selected);
      }
      await saveGlossary(shopName, newTerms);
      setTerms(newTerms);
      message.success(`已添加 ${selected.length} 条术语`);
      setParseModal(false);
      setParsePending([]);
      setParseFile(null);
    } catch (e) {
      message.error(String(e));
    } finally {
      setParseSaving(false);
    }
  }

  const headerExtra = (
    <Space size={8}>
      <Button size="small" icon={<ReloadOutlined />} loading={loading}
        onClick={(e) => { e.stopPropagation(); loadGlossary(); }}>
        刷新
      </Button>
    </Space>
  );

  return (
    <>
      <Collapse
        style={{ marginBottom: 16 }}
        items={[{
          key: "glossary",
          label: (
            <Space>
              <BookOutlined />
              <span>术语表管理</span>
              {loaded && <Tag color="blue">{terms.length} 条</Tag>}
            </Space>
          ),
          extra: headerExtra,
          children: (
            <div>
              <Space wrap size={8} style={{ marginBottom: 12 }}>
                <Input
                  placeholder="商店域名 (e.g. my-shop.myshopify.com)"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  style={{ width: 280 }}
                  allowClear
                  onPressEnter={loadGlossary}
                />
                <Button onClick={loadGlossary} loading={loading}>加载术语表</Button>
                {loaded && (
                  <>
                    <Button icon={<PlusOutlined />} onClick={openAdd}>新增词条</Button>
                    <Button icon={<UploadOutlined />} onClick={() => setCsvModal(true)}>导入 CSV</Button>
                    <Button icon={<UploadOutlined />} onClick={() => setParseModal(true)}>上传文件解析</Button>
                  </>
                )}
              </Space>

              {loaded && (
                <Spin spinning={saving}>
                  <Table
                    dataSource={terms.map((t, i) => ({ ...t, _idx: i }))}
                    rowKey={(r: GlossaryTerm & { _idx: number }) => r._idx}
                    size="small"
                    pagination={{ pageSize: 15 }}
                    scroll={{ x: true }}
                    columns={[
                      { title: "源词", dataIndex: "source", key: "source", width: 180,
                        render: (v: string) => <Typography.Text strong style={{ fontSize: 12 }}>{v}</Typography.Text> },
                      { title: "不翻译", dataIndex: "doNotTranslate", key: "dnt", width: 80,
                        render: (v: boolean) => v ? <Tag color="red">是</Tag> : null },
                      { title: "备注", dataIndex: "note", key: "note",
                        render: (v: string) => v ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>{v}</Typography.Text> : null },
                      { title: "译文",
                        key: "translations",
                        render: (_: unknown, r: GlossaryTerm & { _idx: number }) => (
                          <Space size={4} wrap>
                            {Object.entries(r.translations ?? {}).map(([locale, val]) => (
                              <Tag key={locale} style={{ fontSize: 11 }}><b>{locale}</b>: {val}</Tag>
                            ))}
                          </Space>
                        ),
                      },
                      { title: "操作", key: "action", width: 100,
                        render: (_: unknown, r: GlossaryTerm & { _idx: number }) => (
                          <Space>
                            <Button type="link" size="small" icon={<EditOutlined />}
                              onClick={() => openEdit(r._idx)} />
                            <Popconfirm title="确认删除此词条？" onConfirm={() => handleDelete(r._idx)}
                              okText="删除" cancelText="取消">
                              <Button type="link" size="small" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          </Space>
                        ),
                      },
                    ]}
                  />
                </Spin>
              )}
            </div>
          ),
        }]}
      />

      {/* Add/Edit modal */}
      <Modal
        title={editIndex === null ? "新增词条" : "编辑词条"}
        open={editModal}
        onOk={handleEditOk}
        onCancel={() => setEditModal(false)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={editForm} layout="vertical" size="small">
          <Form.Item name="source" label="源词（原文）" rules={[{ required: true, message: "请填写源词" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="doNotTranslate" valuePropName="checked" label="">
            <Checkbox>标记为不翻译（保留原文）</Checkbox>
          </Form.Item>
          <Form.Item name="translationsStr" label="译文（每行 locale=译文，如 en=Organic Cotton）">
            <Input.TextArea rows={4} placeholder={"en=Organic Cotton\nzh-CN=有机棉\npl=Bawełna organiczna"} />
          </Form.Item>
          <Form.Item name="note" label="备注（可选）">
            <Input placeholder="翻译说明或上下文" />
          </Form.Item>
        </Form>
      </Modal>

      {/* CSV Import modal */}
      <Modal
        title="批量导入 CSV"
        open={csvModal}
        onOk={handleCsvImport}
        onCancel={() => setCsvModal(false)}
        confirmLoading={csvImporting}
        okText="导入"
        cancelText="取消"
        width={600}
      >
        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
          宽格式：首行为 <code>source, do_not_translate, note, en, zh-CN, pl, ...</code>，语言列动态。
        </Typography.Text>
        <Input.TextArea
          rows={8}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder={"source,do_not_translate,note,en,zh-CN\nOrganic Cotton,false,面料名称,Organic Cotton,有机棉"}
          style={{ fontFamily: "monospace", fontSize: 12 }}
        />
        <Divider style={{ margin: "12px 0" }} />
        <Radio.Group value={csvMode} onChange={(e) => setCsvMode(e.target.value as "merge" | "replace")}>
          <Radio value="merge">合并（保留现有词条，填补空缺）</Radio>
          <Radio value="replace">全量替换</Radio>
        </Radio.Group>
      </Modal>

      {/* File parse modal */}
      <Modal
        title="上传文件 LLM 解析"
        open={parseModal}
        onOk={parsePending.length ? handleParseConfirm : handleFileParse}
        onCancel={() => { setParseModal(false); setParsePending([]); setParseFile(null); }}
        confirmLoading={parsing || parseSaving}
        okText={parsePending.length ? "确认添加所选词条" : "解析"}
        cancelText="取消"
        width={700}
      >
        {parsePending.length === 0 ? (
          <>
            <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
              支持 .docx / .xlsx / .xls / .pdf / .txt / .csv，LLM 会自动提取术语表，上传后需预览确认。
            </Typography.Text>
            <Upload
              maxCount={1}
              beforeUpload={() => false}
              accept=".docx,.xlsx,.xls,.pdf,.txt,.csv"
              fileList={parseFile ? [parseFile] : []}
              onChange={({ fileList }) => setParseFile(fileList[0] ?? null)}
            >
              <Button icon={<UploadOutlined />}>选择文件</Button>
            </Upload>
          </>
        ) : (
          <>
            <Space style={{ marginBottom: 8 }}>
              <Typography.Text>已解析 <b>{parsePending.length}</b> 条，请勾选要添加的词条：</Typography.Text>
              <Radio.Group value={parsePendingMode} onChange={(e) => setParsePendingMode(e.target.value as "merge" | "replace")} size="small">
                <Radio value="merge">合并</Radio>
                <Radio value="replace">替换</Radio>
              </Radio.Group>
            </Space>
            <Table
              dataSource={parsePending.map((t, i) => ({ ...t, _key: i }))}
              rowKey="_key"
              size="small"
              pagination={{ pageSize: 8 }}
              rowSelection={{
                selectedRowKeys: parsePendingSelected,
                onChange: (keys) => setParsePendingSelected(keys as string[]),
                getCheckboxProps: (r: GlossaryTerm & { _key: number }) => ({ value: r.source }),
              }}
              columns={[
                { title: "源词", dataIndex: "source", key: "source", width: 160 },
                { title: "不翻译", dataIndex: "doNotTranslate", key: "dnt", width: 70,
                  render: (v: boolean) => v ? <Tag color="red">是</Tag> : null },
                { title: "译文",
                  key: "translations",
                  render: (_: unknown, r: GlossaryTerm & { _key: number }) => (
                    <Space size={4} wrap>
                      {Object.entries(r.translations ?? {}).map(([locale, val]) => (
                        <Tag key={locale} style={{ fontSize: 11 }}><b>{locale}</b>: {val}</Tag>
                      ))}
                    </Space>
                  ),
                },
                { title: "备注", dataIndex: "note", key: "note" },
              ]}
            />
          </>
        )}
      </Modal>
    </>
  );
}

// ── Shop Analysis Panel ───────────────────────────────────────────────────────

const ANALYSIS_RUNNING_STATUSES = new Set(["SCAN_QUEUED", "SCANNING", "ANALYZE_QUEUED", "ANALYZING"]);

const ALL_ANALYSIS_MODULES = ["product", "collection", "article", "blog", "page", "shop"];

const SOURCE_LANG_OPTIONS = [
  { value: "zh-CN", label: "中文简体 (zh-CN)" },
  { value: "en", label: "English (en)" },
  { value: "ja", label: "日本語 (ja)" },
  { value: "ko", label: "한국어 (ko)" },
  { value: "de", label: "Deutsch (de)" },
  { value: "fr", label: "Français (fr)" },
];

function analysisStatusBadge(status: string) {
  if (status === "COMPLETED") return <Badge status="success" text={status} />;
  if (status === "FAILED") return <Badge status="error" text={status} />;
  if (ANALYSIS_RUNNING_STATUSES.has(status)) return <Badge status="processing" text={status} />;
  return <Badge status="default" text={status} />;
}

function ShopAnalysisPanel() {
  const [shopName, setShopName] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("zh-CN");
  const [modules, setModules] = useState<string[]>(ALL_ANALYSIS_MODULES);
  const [job, setJob] = useState<ShopAnalysisJob | null>(null);
  const [profile, setProfile] = useState<ShopProfile | null>(null);
  const [draftTerms, setDraftTerms] = useState<GlossaryTerm[]>([]);
  const [draftStatus, setDraftStatus] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [approvingDraft, setApprovingDraft] = useState(false);
  const [approveMode, setApproveMode] = useState<"merge" | "replace">("merge");
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState<ShopProfile | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isRunning = Boolean(job && ANALYSIS_RUNNING_STATUSES.has(job.status));

  function loadJobStatus() {
    if (!shopName.trim()) return;
    fetchAnalysisStatus(shopName)
      .then((r) => setJob(r.job))
      .catch(() => {});
  }

  function loadProfileData() {
    if (!shopName.trim()) return;
    fetchShopProfile(shopName)
      .then((r) => setProfile(r.profile))
      .catch(() => {});
  }

  function loadDraft() {
    if (!shopName.trim()) return;
    fetchGlossaryDraft(shopName)
      .then((r) => { setDraftTerms(r.terms ?? []); setDraftStatus(r.status ?? null); })
      .catch(() => {});
  }

  // Load when shop changes
  useEffect(() => {
    if (!shopName.trim()) return;
    loadJobStatus();
    loadProfileData();
    loadDraft();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopName]);

  // Poll while running
  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (isRunning) {
      pollingRef.current = setInterval(loadJobStatus, 5_000);
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, shopName]);

  // Refresh profile & draft when job completes
  const prevStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (job?.status === "COMPLETED" && prevStatusRef.current !== "COMPLETED") {
      loadProfileData();
      loadDraft();
    }
    prevStatusRef.current = job?.status;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);

  async function handleTrigger() {
    if (!shopName.trim()) { message.warning("请输入商店域名"); return; }
    setTriggering(true);
    try {
      const r = await triggerShopAnalysis(shopName, { sourceLanguage, modules });
      setJob(r.job);
      message.success("商店分析任务已启动");
    } catch (e: unknown) {
      message.error(`启动失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTriggering(false);
    }
  }

  async function handleApproveDraft() {
    if (!shopName.trim()) return;
    setApprovingDraft(true);
    try {
      const r = await approveGlossaryDraft(shopName, approveMode);
      message.success(`已生效 ${r.total} 条术语（${r.mode}）`);
      setDraftTerms([]);
    } catch (e) {
      message.error(String(e));
    } finally {
      setApprovingDraft(false);
    }
  }

  async function handleSaveProfile() {
    if (!profileDraft || !shopName.trim()) return;
    setSavingProfile(true);
    try {
      await saveShopProfile(shopName, profileDraft);
      setProfile(profileDraft);
      setEditingProfile(false);
      message.success("商店档案已保存");
    } catch (e) {
      message.error(String(e));
    } finally {
      setSavingProfile(false);
    }
  }

  const headerExtra = (
    <Space size={8}>
      <Button size="small" icon={<ReloadOutlined />}
        onClick={(e) => { e.stopPropagation(); loadJobStatus(); loadProfileData(); loadDraft(); }}>
        刷新
      </Button>
    </Space>
  );

  return (
    <Collapse
      style={{ marginBottom: 16 }}
      items={[{
        key: "shop-analysis",
        label: (
          <Space>
            <ScanOutlined />
            <span>商店扫描分析</span>
            {job && (
              <Tag color={job.status === "COMPLETED" ? "success" : job.status === "FAILED" ? "error" : "processing"}>
                {job.status}
              </Tag>
            )}
          </Space>
        ),
        extra: headerExtra,
        children: (
          <div>
            {/* Trigger section */}
            <Space wrap size={8} style={{ marginBottom: 12 }}>
              <Input
                placeholder="商店域名"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                style={{ width: 260 }}
                allowClear
              />
              <Select
                value={sourceLanguage}
                onChange={setSourceLanguage}
                options={SOURCE_LANG_OPTIONS}
                style={{ width: 180 }}
              />
              <Checkbox.Group
                options={ALL_ANALYSIS_MODULES.map((m) => ({ label: m, value: m }))}
                value={modules}
                onChange={(v) => setModules(v as string[])}
              />
              <Button
                type="primary"
                icon={<ScanOutlined />}
                loading={triggering}
                disabled={!shopName.trim() || isRunning}
                onClick={handleTrigger}
              >
                {isRunning ? "分析中…" : "扫描并分析"}
              </Button>
            </Space>

            {/* Job status */}
            {job && (
              <div style={{ marginBottom: 12 }}>
                <Space direction="vertical" size={4}>
                  <Space>
                    {analysisStatusBadge(job.status)}
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      触发人: {job.triggeredBy} · 更新: {new Date(job.updatedAt).toLocaleString("zh-CN")}
                    </Typography.Text>
                  </Space>
                  {(isRunning || job.status === "COMPLETED") && (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      扫描模块: {job.metrics.scannedModules}，资源: {job.metrics.scannedResources}，
                      分析批次: {job.metrics.analyzedChunks}，草稿词条: {job.metrics.glossaryDraftCount}
                    </Typography.Text>
                  )}
                  {job.status === "FAILED" && job.errorMessage && (
                    <Alert type="error" message={job.errorMessage} showIcon style={{ marginTop: 4 }} />
                  )}
                  {isRunning && <Progress percent={
                    job.metrics.analyzedChunks && job.metrics.scannedResources
                      ? Math.min(99, Math.round((job.metrics.analyzedChunks / Math.ceil(job.metrics.scannedResources / 15)) * 100))
                      : job.status.startsWith("SCAN") ? 10 : 50
                  } status="active" size="small" style={{ maxWidth: 300 }} />}
                </Space>
              </div>
            )}

            {/* Shop Profile */}
            {profile && (
              <>
                <Divider orientation="left" style={{ fontSize: 13 }}>商店档案</Divider>
                {editingProfile && profileDraft ? (
                  <div style={{ maxWidth: 600 }}>
                    <Space style={{ marginBottom: 8 }}>
                      <Button type="primary" size="small" loading={savingProfile} onClick={handleSaveProfile}>保存</Button>
                      <Button size="small" onClick={() => setEditingProfile(false)}>取消</Button>
                    </Space>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {(["industry", "toneOfVoice", "targetAudience"] as const).map((field) => (
                        <div key={field}>
                          <Typography.Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                            {{ industry: "行业", toneOfVoice: "语气风格", targetAudience: "目标受众" }[field]}
                          </Typography.Text>
                          <Input size="small" value={profileDraft[field]}
                            onChange={(e) => setProfileDraft({ ...profileDraft, [field]: e.target.value })} />
                        </div>
                      ))}
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block" }}>高频词（每行一个）</Typography.Text>
                        <Input.TextArea rows={3} size="small"
                          value={profileDraft.highFrequencyTerms.join("\n")}
                          onChange={(e) => setProfileDraft({ ...profileDraft, highFrequencyTerms: e.target.value.split("\n").filter(Boolean) })} />
                      </div>
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block" }}>风格备注（每行一条）</Typography.Text>
                        <Input.TextArea rows={3} size="small"
                          value={profileDraft.styleNotes.join("\n")}
                          onChange={(e) => setProfileDraft({ ...profileDraft, styleNotes: e.target.value.split("\n").filter(Boolean) })} />
                      </div>
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block" }}>翻译指令（注入系统 Prompt）</Typography.Text>
                        <Input.TextArea rows={4} size="small"
                          value={profileDraft.translationInstructions}
                          onChange={(e) => setProfileDraft({ ...profileDraft, translationInstructions: e.target.value })} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <Space style={{ marginBottom: 8 }}>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        分析时间: {new Date(profile.analyzedAt).toLocaleString("zh-CN")}
                      </Typography.Text>
                      <Button size="small" icon={<EditOutlined />}
                        onClick={() => { setProfileDraft({ ...profile }); setEditingProfile(true); }}>
                        编辑
                      </Button>
                    </Space>
                    <Descriptions column={1} size="small" bordered style={{ maxWidth: 600 }}>
                      <Descriptions.Item label="行业">{profile.industry}</Descriptions.Item>
                      <Descriptions.Item label="语气风格">{profile.toneOfVoice}</Descriptions.Item>
                      <Descriptions.Item label="目标受众">{profile.targetAudience}</Descriptions.Item>
                      <Descriptions.Item label="高频词">
                        <Space size={4} wrap>
                          {profile.highFrequencyTerms.map((t) => <Tag key={t}>{t}</Tag>)}
                        </Space>
                      </Descriptions.Item>
                      <Descriptions.Item label="风格备注">
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {profile.styleNotes.map((n, i) => <li key={i} style={{ fontSize: 12 }}>{n}</li>)}
                        </ul>
                      </Descriptions.Item>
                      <Descriptions.Item label="翻译指令">
                        <Typography.Text style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
                          {profile.translationInstructions}
                        </Typography.Text>
                      </Descriptions.Item>
                    </Descriptions>
                  </>
                )}
              </>
            )}

            {/* Glossary Draft */}
            {draftTerms.length > 0 && (
              <>
                <Divider orientation="left" style={{ fontSize: 13 }}>词条草稿（待确认）</Divider>
                <Space style={{ marginBottom: 8 }} wrap>
                  <Tag color="gold">{draftTerms.length} 条待确认</Tag>
                  {draftStatus && (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>状态: {draftStatus}</Typography.Text>
                  )}
                  <Radio.Group value={approveMode} onChange={(e) => setApproveMode(e.target.value as "merge" | "replace")} size="small">
                    <Radio value="merge">合并到现有术语表</Radio>
                    <Radio value="replace">替换现有术语表</Radio>
                  </Radio.Group>
                  <Popconfirm
                    title={`确认以"${approveMode === "merge" ? "合并" : "替换"}"模式将草稿写入术语表？`}
                    onConfirm={handleApproveDraft}
                    okText="确认生效"
                    cancelText="取消"
                  >
                    <Button type="primary" size="small" loading={approvingDraft}>确认生效</Button>
                  </Popconfirm>
                </Space>
                <Table
                  dataSource={draftTerms.map((t, i) => ({ ...t, _key: i }))}
                  rowKey="_key"
                  size="small"
                  pagination={{ pageSize: 10 }}
                  scroll={{ x: true }}
                  style={{ maxWidth: 800 }}
                  columns={[
                    { title: "源词", dataIndex: "source", key: "source", width: 160 },
                    { title: "不翻译", dataIndex: "doNotTranslate", key: "dnt", width: 70,
                      render: (v: boolean) => v ? <Tag color="red">是</Tag> : null },
                    { title: "备注", dataIndex: "note", key: "note" },
                    {
                      title: "译文",
                      key: "translations",
                      render: (_: unknown, r: GlossaryTerm & { _key: number }) => (
                        <Space size={4} wrap>
                          {Object.entries(r.translations ?? {}).map(([locale, val]) => (
                            <Tag key={locale} style={{ fontSize: 11 }}><b>{locale}</b>: {val}</Tag>
                          ))}
                        </Space>
                      ),
                    },
                  ]}
                />
              </>
            )}
          </div>
        ),
      }]}
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
      <ShopAnalysisPanel />
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
