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
  fetchPixelLogConfig,
  fetchPixelLogs,
  type PixelLogConfig,
  type PixelLogRow,
} from "../api";

/** Shopify 标准事件（api_version 2026-07）+ 自定义事件前缀，供下拉提示；也可手输任意 topic。 */
const EVENT_OPTIONS = [
  "spark:shopify:page_viewed",
  "spark:shopify:product_viewed",
  "spark:shopify:collection_viewed",
  "spark:shopify:search_submitted",
  "spark:shopify:cart_viewed",
  "spark:shopify:product_added_to_cart",
  "spark:shopify:product_removed_from_cart",
  "spark:shopify:checkout_started",
  "spark:shopify:checkout_contact_info_submitted",
  "spark:shopify:checkout_address_info_submitted",
  "spark:shopify:checkout_shipping_info_submitted",
  "spark:shopify:payment_info_submitted",
  "spark:shopify:checkout_completed",
  "spark:shopify:alert_displayed",
  "spark:shopify:ui_extension_errored",
].map((v) => ({ value: v }));

function eventColor(event: string): string {
  if (event.includes("checkout") || event.includes("payment")) return "orange";
  if (event.includes("cart")) return "blue";
  if (event.includes("viewed") || event.includes("search")) return "green";
  if (event.startsWith("spark:custom:")) return "purple";
  if (event.includes("error") || event.includes("alert")) return "red";
  return "default";
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
  clientId: string;
  event: string;
  keyword: string;
  range: [number, number] | null;
};

const EMPTY_FILTERS: AppliedFilters = {
  shop: "",
  clientId: "",
  event: "",
  keyword: "",
  range: null,
};

export default function PixelLogs() {
  const [config, setConfig] = useState<PixelLogConfig | null>(null);

  // 草稿筛选（输入中）与已应用筛选（点击查询后生效）分离，避免每次按键都打 SLS
  const [shop, setShop] = useState("");
  const [clientId, setClientId] = useState("");
  const [event, setEvent] = useState("");
  const [keyword, setKeyword] = useState("");
  const [range, setRange] = useState<[number, number] | null>(null);
  const [applied, setApplied] = useState<AppliedFilters>(EMPTY_FILTERS);

  const [logs, setLogs] = useState<PixelLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [complete, setComplete] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchPixelLogConfig()
      .then(setConfig)
      .catch((e) => setError(String(e)));
  }, []);

  const load = useCallback(() => {
    if (!config?.configured) return;
    setLoading(true);
    setError("");
    fetchPixelLogs({
      shop: applied.shop || undefined,
      clientId: applied.clientId || undefined,
      event: applied.event || undefined,
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
    setApplied({ shop, clientId, event, keyword, range });
  }

  const notConfigured = config !== null && !config.configured;

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
      title: "事件",
      dataIndex: "event",
      key: "event",
      render: (v: string) => (
        <Tag
          color={eventColor(v)}
          style={{ cursor: "pointer" }}
          onClick={() => {
            setEvent(v);
            setPage(1);
            setApplied((prev) => ({ ...prev, event: v }));
          }}
        >
          {v}
        </Tag>
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
      title: "用户 (clientId)",
      dataIndex: "clientId",
      key: "clientId",
      render: (v: string) => (
        <Typography.Text
          code
          style={{ fontSize: 12, cursor: "pointer" }}
          onClick={() => {
            setClientId(v);
            setPage(1);
            setApplied((prev) => ({ ...prev, clientId: v }));
          }}
        >
          {v}
        </Typography.Text>
      ),
    },
    {
      title: "商品 ID",
      dataIndex: "productId",
      key: "productId",
      width: 130,
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
        WebPixel 日志
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
          当前 logstore：{config.project} / {config.logstore}
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
        <Input
          placeholder="用户 clientId"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          onPressEnter={search}
          allowClear
          style={{ width: 200 }}
        />
        <AutoComplete
          placeholder="事件（topic），可手输"
          value={event}
          onChange={setEvent}
          options={EVENT_OPTIONS}
          filterOption={(input, option) =>
            (option?.value ?? "").includes(input)
          }
          allowClear
          style={{ width: 300 }}
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
            expandedRowRender: (row: PixelLogRow) => (
              <div style={{ maxWidth: 1000 }}>
                <Descriptions
                  size="small"
                  column={3}
                  style={{ marginBottom: 8 }}
                  items={[
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
