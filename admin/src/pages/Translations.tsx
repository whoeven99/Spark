import { useEffect, useState, useCallback, useMemo } from "react";
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
} from "antd";
import { SearchOutlined, ReloadOutlined } from "@ant-design/icons";
import { fetchTranslations, fetchTranslationJob, type TranslationJob } from "../api";

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
