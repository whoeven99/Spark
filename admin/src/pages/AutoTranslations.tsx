import { useEffect, useState, useCallback } from "react";
import {
  Table,
  Select,
  Input,
  Tag,
  Typography,
  Spin,
  Alert,
  Progress,
  Badge,
  Space,
  Button,
  Row,
  Col,
  Card,
  Statistic,
  Tooltip,
} from "antd";
import { SearchOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  fetchTranslations,
  fetchAutoTranslationSummary,
  AUTO_TASK_SOURCE,
  type TranslationJob,
  type AutoTranslationSummary,
} from "../api";

const { Title, Text } = Typography;

const ACTIVE_STATUSES = new Set([
  "CREATED",
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

const STATUS_OPTIONS = [
  "INIT_QUEUED",
  "INITIALIZING",
  "TRANSLATE_QUEUED",
  "TRANSLATING",
  "WRITING_BACK",
  "VERIFYING",
  "COMPLETED",
  "FAILED",
  "PAUSED",
  "CANCELLED",
];

function statusBadge(status: string) {
  if (status === "COMPLETED") return <Badge status="success" text={status} />;
  if (status === "FAILED") return <Badge status="error" text={status} />;
  if (status === "CANCELLED") return <Badge status="default" text={status} />;
  if (status === "PAUSED") return <Badge status="warning" text={status} />;
  if (ACTIVE_STATUSES.has(status)) return <Badge status="processing" text={status} />;
  return <Badge status="default" text={status} />;
}

function calcProgress(job: TranslationJob): number {
  if (typeof job.progressPercent === "number") return job.progressPercent;
  const m = job.metrics;
  const total = m.translateTotal || m.initTotal;
  if (!total) return job.status === "COMPLETED" ? 100 : 0;
  const done = m.translateDone + m.translateFailed;
  return Math.min(100, Math.round((done / total) * 100));
}

function fmtTime(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

// 终态/进行中聚合，用于汇总卡片
function sumActive(byStatus: Record<string, number>): number {
  return Object.entries(byStatus)
    .filter(([s]) => ACTIVE_STATUSES.has(s))
    .reduce((acc, [, n]) => acc + n, 0);
}

export default function AutoTranslations() {
  const [jobs, setJobs] = useState<TranslationJob[]>([]);
  const [summary, setSummary] = useState<AutoTranslationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [shopFilter, setShopFilter] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [jobsRes, summaryRes] = await Promise.all([
        fetchTranslations({
          source: AUTO_TASK_SOURCE,
          status: statusFilter,
          shop: shopFilter.trim() || undefined,
          limit: 200,
        }),
        fetchAutoTranslationSummary(),
      ]);
      setJobs(jobsRes.jobs);
      setSummary(summaryRes);
      setNote(summaryRes.note ?? (jobsRes as { note?: string }).note ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, shopFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [autoRefresh, load]);

  const byStatus = summary?.byStatus ?? {};

  const columns = [
    {
      title: "店铺",
      dataIndex: "shopName",
      key: "shopName",
      render: (s: string) => <Text copyable>{s}</Text>,
    },
    {
      title: "语言",
      key: "lang",
      render: (_: unknown, j: TranslationJob) => (
        <Tag>
          {j.source} → {j.target}
        </Tag>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (s: string) => statusBadge(s),
    },
    {
      title: "进度",
      key: "progress",
      width: 200,
      render: (_: unknown, j: TranslationJob) => {
        const pct = calcProgress(j);
        const status =
          j.status === "FAILED" ? "exception" : j.status === "COMPLETED" ? "success" : "active";
        return (
          <Tooltip
            title={`翻译 ${j.metrics.translateDone}/${j.metrics.translateTotal}　失败 ${j.metrics.translateFailed}　回写 ${j.metrics.writebackDone}/${j.metrics.writebackTotal}`}
          >
            <Progress percent={pct} size="small" status={status} />
          </Tooltip>
        );
      },
    },
    {
      title: "Tokens",
      key: "tokens",
      render: (_: unknown, j: TranslationJob) => j.metrics.usedTokens.toLocaleString(),
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      render: fmtTime,
      sorter: (a: TranslationJob, b: TranslationJob) =>
        a.createdAt.localeCompare(b.createdAt),
      defaultSortOrder: "descend" as const,
    },
    {
      title: "错误",
      key: "error",
      render: (_: unknown, j: TranslationJob) =>
        j.errorMessage ? (
          <Tooltip title={`${j.errorStage ?? ""} ${j.errorMessage}`}>
            <Text type="danger" ellipsis style={{ maxWidth: 200, display: "inline-block" }}>
              {j.errorMessage}
            </Text>
          </Tooltip>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
  ];

  return (
    <div>
      <Space style={{ width: "100%", justifyContent: "space-between", marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          自动翻译监控
        </Title>
        <Space>
          <Button
            type={autoRefresh ? "primary" : "default"}
            onClick={() => setAutoRefresh((v) => !v)}
          >
            自动刷新{autoRefresh ? "中(10s)" : "已关"}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={load}>
            刷新
          </Button>
        </Space>
      </Space>

      {note && <Alert type="info" showIcon message={note} style={{ marginBottom: 16 }} />}
      {error && (
        <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} closable />
      )}

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card size="small">
            <Statistic title="今日新建" value={summary?.createdToday ?? 0} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="累计任务" value={summary?.total ?? 0} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="进行中"
              value={sumActive(byStatus)}
              valueStyle={{ color: "#1677ff" }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="成功"
              value={byStatus.COMPLETED ?? 0}
              valueStyle={{ color: "#52c41a" }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="失败"
              value={byStatus.FAILED ?? 0}
              valueStyle={{ color: "#cf1322" }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="暂停/取消" value={(byStatus.PAUSED ?? 0) + (byStatus.CANCELLED ?? 0)} />
          </Card>
        </Col>
      </Row>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="按店铺筛选"
          prefix={<SearchOutlined />}
          allowClear
          value={shopFilter}
          onChange={(e) => setShopFilter(e.target.value)}
          onPressEnter={load}
          style={{ width: 240 }}
        />
        <Select
          placeholder="按状态筛选"
          allowClear
          style={{ width: 200 }}
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_OPTIONS.map((s) => ({ label: s, value: s }))}
        />
      </Space>

      <Spin spinning={loading}>
        <Table<TranslationJob>
          rowKey="id"
          dataSource={jobs}
          columns={columns}
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: true }}
        />
      </Spin>
    </div>
  );
}
