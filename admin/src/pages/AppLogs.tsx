import { useEffect, useState, useCallback } from "react";
import {
  Table,
  Input,
  Tag,
  Typography,
  Spin,
  Alert,
  Space,
  DatePicker,
  Button,
  AutoComplete,
  Descriptions,
  Empty,
} from "antd";
import { SearchOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  fetchAppLogConfig,
  fetchAppLogs,
  type AppLogConfig,
  type AppLogRow,
} from "../api";

/** Spark App 功能模块，供 feature 下拉提示；也可手输任意值。 */
const FEATURE_OPTIONS = [
  "chat",
  "diagnosis",
  "translation-v4",
  "product-improve",
  "image-studio",
  "order-monitor",
  "billing",
].map((v) => ({ value: v }));

const FEATURE_LABELS: Record<string, string> = {
  chat: "AI 助手",
  diagnosis: "诊断报告",
  "translation-v4": "翻译 v4",
  "product-improve": "商品优化",
  "image-studio": "图片工具",
  "order-monitor": "订单监控",
  billing: "套餐计费",
};

function featureColor(feature: string): string {
  switch (feature) {
    case "chat":
      return "geekblue";
    case "translation-v4":
      return "green";
    case "product-improve":
      return "cyan";
    case "image-studio":
      return "purple";
    case "billing":
      return "gold";
    case "diagnosis":
      return "blue";
    case "order-monitor":
      return "volcano";
    default:
      return "default";
  }
}

function formatPayloadPreview(payload: string): string {
  if (!payload) return "";
  return payload.length > 120 ? `${payload.slice(0, 120)}…` : payload;
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

type AppliedFilters = {
  shop: string;
  feature: string;
  action: string;
  keyword: string;
  range: [number, number] | null;
};

const EMPTY_FILTERS: AppliedFilters = {
  shop: "",
  feature: "",
  action: "",
  keyword: "",
  range: null,
};

export default function AppLogs() {
  const [config, setConfig] = useState<AppLogConfig | null>(null);

  // 草稿筛选（输入中）与已应用筛选（点击查询后生效）分离，避免每次按键都打 SLS
  const [shop, setShop] = useState("");
  const [feature, setFeature] = useState("");
  const [action, setAction] = useState("");
  const [keyword, setKeyword] = useState("");
  const [range, setRange] = useState<[number, number] | null>(null);
  const [applied, setApplied] = useState<AppliedFilters>(EMPTY_FILTERS);

  const [logs, setLogs] = useState<AppLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [complete, setComplete] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAppLogConfig()
      .then(setConfig)
      .catch((e) => setError(String(e)));
  }, []);

  const load = useCallback(() => {
    if (!config?.configured) return;
    setLoading(true);
    setError("");
    fetchAppLogs({
      shop: applied.shop || undefined,
      feature: applied.feature || undefined,
      action: applied.action || undefined,
      keyword: applied.keyword || undefined,
      from: applied.range?.[0],
      to: applied.range?.[1],
      page,
      pageSize,
    })
      .then((r) => {
        setLogs(r.logs);
        setTotal(r.total);
        setComplete(r.complete);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [config?.configured, applied, page]);

  useEffect(() => {
    load();
  }, [load]);

  function search() {
    setPage(1);
    setApplied({ shop, feature, action, keyword, range });
  }

  const columns = [
    {
      title: "时间",
      dataIndex: "time",
      key: "time",
      width: 165,
      render: (v: number) => (
        <Typography.Text style={{ fontSize: 12 }}>
          {v ? new Date(v).toLocaleString("zh-CN") : "-"}
        </Typography.Text>
      ),
    },
    {
      title: "功能",
      dataIndex: "feature",
      key: "feature",
      width: 130,
      render: (v: string) => (
        <Tag
          color={featureColor(v)}
          style={{ cursor: "pointer" }}
          onClick={() => {
            setFeature(v);
            setPage(1);
            setApplied((prev) => ({ ...prev, feature: v }));
          }}
        >
          {FEATURE_LABELS[v] ?? v}
        </Tag>
      ),
    },
    {
      title: "操作",
      dataIndex: "action",
      key: "action",
      width: 160,
      render: (v: string) => (
        <Typography.Text
          code
          style={{ fontSize: 12, cursor: "pointer" }}
          onClick={() => {
            setAction(v);
            setPage(1);
            setApplied((prev) => ({ ...prev, action: v }));
          }}
        >
          {v || "-"}
        </Typography.Text>
      ),
    },
    {
      title: "商店",
      dataIndex: "shopName",
      key: "shopName",
      render: (v: string) => (
        <Typography.Link
          style={{ fontSize: 13 }}
          onClick={() => {
            setShop(v);
            setPage(1);
            setApplied((prev) => ({ ...prev, shop: v }));
          }}
        >
          {v}
        </Typography.Link>
      ),
    },
    {
      title: "套餐",
      dataIndex: "plan",
      key: "plan",
      width: 150,
      render: (v: string) =>
        v ? (
          <Typography.Text style={{ fontSize: 12 }}>{v}</Typography.Text>
        ) : (
          <Typography.Text type="secondary">-</Typography.Text>
        ),
    },
    {
      title: "Payload",
      dataIndex: "payload",
      key: "payload",
      render: (v: string) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {formatPayloadPreview(v) || "-"}
        </Typography.Text>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>
        Spark 应用日志
      </Typography.Title>

      {config && !config.configured && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="阿里云日志未配置"
          description="请在环境变量中配置 ALIBABA_CLOUD_ACCESS_KEY_ID、ALIBABA_CLOUD_ACCESS_KEY_SECRET、ALIBABA_CLOUD_ENDPOINT；可选 ALIBABA_CLOUD_PROJECT、ALIBABA_CLOUD_LOGSTORE。切换测试 / 正式环境时手动修改 logstore 即可。"
        />
      )}

      {config?.configured && (
        <Typography.Text
          type="secondary"
          style={{ fontSize: 12, display: "block", marginBottom: 12 }}
        >
          当前 logstore：{config.project} / {config.logstore}（topic: spark:app:feature）
        </Typography.Text>
      )}

      {/* 筛选 */}
      <Space wrap style={{ marginBottom: 16 }}>
        <Input
          prefix={<SearchOutlined />}
          placeholder="商店域名（*.myshopify.com）"
          value={shop}
          onChange={(e) => setShop(e.target.value)}
          onPressEnter={search}
          allowClear
          style={{ width: 230 }}
        />
        <AutoComplete
          placeholder="功能（feature），可手输"
          value={feature}
          onChange={setFeature}
          options={FEATURE_OPTIONS}
          filterOption={(input, option) =>
            (option?.value ?? "").includes(input)
          }
          allowClear
          style={{ width: 200 }}
        />
        <Input
          placeholder="操作（action）"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          onPressEnter={search}
          allowClear
          style={{ width: 200 }}
        />
        <Input
          placeholder="全文关键字"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={search}
          allowClear
          style={{ width: 180 }}
        />
        <DatePicker.RangePicker
          showTime
          placeholder={["开始时间（默认 24h 前）", "结束时间（默认现在）"]}
          onChange={(_, strs) => {
            setRange(
              strs[0] && strs[1]
                ? [new Date(strs[0]).getTime(), new Date(strs[1]).getTime()]
                : null,
            );
          }}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={search}>
          查询
        </Button>
        <Button icon={<ReloadOutlined />} onClick={load}>
          刷新
        </Button>
      </Space>

      {error && (
        <Alert type="error" message={error} style={{ marginBottom: 16 }} />
      )}
      {!complete && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="结果可能不完整：SLS 本次查询未扫描全部数据，可缩小时间范围后重试。"
        />
      )}

      <Spin spinning={loading}>
        <Table
          dataSource={logs}
          columns={columns}
          rowKey="id"
          size="small"
          locale={{
            emptyText: <Empty description="当前条件下没有日志" />,
          }}
          expandable={{
            expandedRowRender: (row: AppLogRow) => (
              <div style={{ maxWidth: 1000 }}>
                <Descriptions
                  size="small"
                  column={3}
                  style={{ marginBottom: 8 }}
                  items={[
                    { key: "path", label: "页面路径", children: row.path || "-" },
                    { key: "source", label: "上报来源", children: row.source || "-" },
                    {
                      key: "schemaVersion",
                      label: "schemaVersion",
                      children: row.schemaVersion || "-",
                    },
                    {
                      key: "extra",
                      label: "其他字段",
                      children: Object.keys(row.extra).length
                        ? Object.entries(row.extra)
                            .map(([k, v]) => `${k}=${v}`)
                            .join("  ")
                        : "-",
                    },
                  ]}
                />
                {row.payload ? (
                  <pre
                    style={{
                      margin: 0,
                      padding: 12,
                      background: "#fafafa",
                      border: "1px solid #f0f0f0",
                      borderRadius: 6,
                      fontSize: 12,
                      maxHeight: 420,
                      overflow: "auto",
                    }}
                  >
                    {prettyJson(row.payload)}
                  </pre>
                ) : (
                  <Typography.Text type="secondary">无 payload</Typography.Text>
                )}
              </div>
            ),
          }}
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (t) => `共 ${t} 条`,
          }}
        />
      </Spin>
    </div>
  );
}
