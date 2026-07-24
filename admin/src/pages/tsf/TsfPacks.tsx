import { useCallback, useEffect, useState } from "react";
import {
  Table,
  Input,
  Tag,
  Typography,
  Spin,
  Alert,
  Space,
  Button,
  Row,
  Col,
  Card,
  Statistic,
  Select,
  DatePicker,
} from "antd";
import { SearchOutlined, ReloadOutlined, ShoppingCartOutlined } from "@ant-design/icons";
import { fetchTsfPacks, type TsfPackPurchaseRow } from "../../api";

const { RangePicker } = DatePicker;

function formatCredits(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

export default function TsfPacks() {
  const [purchases, setPurchases] = useState<TsfPackPurchaseRow[]>([]);
  const [stats, setStats] = useState({ totalPurchases: 0, shopCount: 0, totalCreditsGranted: 0, totalRevenue: 0 });
  const [total, setTotal] = useState(0);
  const [planOptions, setPlanOptions] = useState<{ planKey: string | null; displayName: string | null; count: number }[]>([]);
  const [shop, setShop] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetchTsfPacks({
      shop: shop.trim() || undefined,
      plan: planFilter || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page,
      pageSize,
    })
      .then((r) => {
        setPurchases(r.purchases);
        setStats(r.stats);
        setTotal(r.total);
        setPlanOptions(r.planOptions);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [shop, planFilter, startDate, endDate, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    {
      title: "商店",
      dataIndex: "shop",
      key: "shop",
      render: (v: string) => (
        <Typography.Text copyable style={{ fontSize: 12 }}>
          {v}
        </Typography.Text>
      ),
    },
    {
      title: "流量包",
      key: "pack",
      render: (_: unknown, r: TsfPackPurchaseRow) => (
        <div>
          <Tag color="orange">{r.displayName ?? r.planKey ?? "-"}</Tag>
          {r.planKey && r.displayName && (
            <Typography.Text type="secondary" style={{ fontSize: 11, display: "block" }}>
              {r.planKey}
            </Typography.Text>
          )}
        </div>
      ),
    },
    {
      title: "Credits 到账",
      dataIndex: "creditsDelta",
      key: "creditsDelta",
      render: (v: number) => (
        <Typography.Text strong style={{ color: "#1677ff" }}>
          +{formatCredits(v)}
        </Typography.Text>
      ),
    },
    {
      title: "金额",
      key: "price",
      render: (_: unknown, r: TsfPackPurchaseRow) =>
        r.priceAmount > 0 ? (
          <Typography.Text strong style={{ color: "#52c41a" }}>
            ${r.priceAmount.toFixed(2)} {r.currencyCode}
          </Typography.Text>
        ) : (
          <Typography.Text type="secondary">-</Typography.Text>
        ),
    },
    {
      title: "Shopify 订单",
      dataIndex: "referenceId",
      key: "referenceId",
      render: (v: string | null) =>
        v ? (
          <Typography.Text type="secondary" style={{ fontSize: 11 }} ellipsis={{ tooltip: v }}>
            {v.split("/").pop()}
          </Typography.Text>
        ) : (
          "-"
        ),
    },
    {
      title: "购买时间",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (v: string) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {new Date(v).toLocaleString("zh-CN")}
        </Typography.Text>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 4 }}>
        翻译 加购流量包
      </Typography.Title>
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 16, fontSize: 12 }}>
        记录翻译新用户一次性加量包购买（BillingLog · TOKEN_PACK_PURCHASED）
      </Typography.Text>

      {error && (
        <Alert type="error" message={error} style={{ marginBottom: 16 }} closable onClose={() => setError("")} />
      )}

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic title="购买次数" value={stats.totalPurchases} prefix={<ShoppingCartOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic title="购买商店数" value={stats.shopCount} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic title="累计到账 Credits" value={formatCredits(stats.totalCreditsGranted)} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="累计金额 (USD)"
              value={stats.totalRevenue}
              precision={2}
              prefix="$"
              valueStyle={{ color: "#52c41a" }}
            />
          </Card>
        </Col>
      </Row>

      {planOptions.length > 0 && (
        <Card size="small" title="套餐分布" style={{ marginBottom: 16 }}>
          <Space wrap>
            {planOptions.map((p) => (
              <Tag
                key={p.planKey ?? "none"}
                color={planFilter === p.planKey ? "blue" : "default"}
                style={{ cursor: "pointer" }}
                onClick={() => {
                  setPlanFilter(planFilter === (p.planKey ?? "") ? "" : (p.planKey ?? ""));
                  setPage(1);
                }}
              >
                {p.displayName ?? p.planKey ?? "未知"} × {p.count}
              </Tag>
            ))}
          </Space>
        </Card>
      )}

      <Space wrap style={{ marginBottom: 16 }}>
        <Input
          prefix={<SearchOutlined />}
          placeholder="商店域名"
          value={shop}
          onChange={(e) => setShop(e.target.value)}
          onPressEnter={() => { setPage(1); load(); }}
          allowClear
          style={{ width: 220 }}
        />
        <Select
          placeholder="流量包类型"
          allowClear
          style={{ width: 180 }}
          value={planFilter || undefined}
          onChange={(v) => { setPlanFilter(v ?? ""); setPage(1); }}
          options={planOptions
            .filter((p) => p.planKey)
            .map((p) => ({ value: p.planKey!, label: p.displayName ?? p.planKey! }))}
        />
        <RangePicker
          onChange={(_, strs) => {
            setStartDate(strs[0] ?? "");
            setEndDate(strs[1] ?? "");
            setPage(1);
          }}
          allowClear
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={() => { setPage(1); load(); }}>
          查询
        </Button>
        <Button icon={<ReloadOutlined />} onClick={load}>
          刷新
        </Button>
      </Space>

      <Spin spinning={loading}>
        <Table
          dataSource={purchases}
          columns={columns}
          rowKey={(r, i) => `${r.shop}-${r.createdAt}-${i}`}
          size="small"
          pagination={{
            current: page,
            pageSize,
            total,
            showTotal: (t) => `共 ${t} 条购买记录`,
            onChange: (p) => setPage(p),
          }}
        />
      </Spin>
    </div>
  );
}
