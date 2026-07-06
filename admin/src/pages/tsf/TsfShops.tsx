import { useCallback, useEffect, useState } from "react";
import {
  Table,
  Input,
  Tag,
  Typography,
  Spin,
  Alert,
  Drawer,
  Descriptions,
  Space,
  Button,
} from "antd";
import { SearchOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  fetchTsfShops,
  fetchTsfShopDetail,
  type TsfShopRow,
  type TsfShopDetail,
} from "../../api";

function usageColor(pct: number): string {
  if (pct >= 90) return "#ff4d4f";
  if (pct >= 70) return "#faad14";
  return "#52c41a";
}

export default function TsfShops() {
  const [shops, setShops] = useState<TsfShopRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [activeShop, setActiveShop] = useState<string | null>(null);
  const [detail, setDetail] = useState<TsfShopDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback((keyword?: string) => {
    setLoading(true);
    fetchTsfShops(keyword)
      .then((r) => setShops(r.shops))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openDetail(shop: string) {
    setActiveShop(shop);
    setDetail(null);
    setDetailLoading(true);
    fetchTsfShopDetail(shop)
      .then(setDetail)
      .catch((e) => setError(String(e)))
      .finally(() => setDetailLoading(false));
  }

  const columns = [
    {
      title: "商店",
      dataIndex: "shop",
      key: "shop",
      render: (v: string) => (
        <Typography.Link onClick={() => openDetail(v)} style={{ fontSize: 13 }}>
          {v}
        </Typography.Link>
      ),
    },
    {
      title: "状态",
      dataIndex: "installed",
      key: "installed",
      width: 90,
      render: (v: boolean) =>
        v ? <Tag color="green">在装</Tag> : <Tag color="volcano">已卸载</Tag>,
    },
    {
      title: "套餐",
      dataIndex: "planKey",
      key: "planKey",
      render: (v: string | null) => (v ? <Tag color="blue">{v}</Tag> : <Typography.Text type="secondary">-</Typography.Text>),
    },
    {
      title: "订阅状态",
      dataIndex: "subStatus",
      key: "subStatus",
      width: 110,
      render: (v: string | null) =>
        v ? <Tag color={v === "ACTIVE" ? "green" : "default"}>{v}</Tag> : <Typography.Text type="secondary">-</Typography.Text>,
    },
    {
      title: "Credits（已用 / 总量）",
      key: "credits",
      render: (_: unknown, r: TsfShopRow) => {
        const total = r.subscriptionCredits + r.purchasedCredits + r.trialCredits;
        const pct = total > 0 ? Math.round((r.usedCredits / total) * 100) : 0;
        return (
          <span>
            <span style={{ color: usageColor(pct), fontWeight: 600 }}>
              {r.usedCredits.toLocaleString()}
            </span>
            {" / "}
            {total.toLocaleString()}
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {" "}({pct}%)
            </Typography.Text>
          </span>
        );
      },
    },
    {
      title: "注册时间",
      dataIndex: "boundAt",
      key: "boundAt",
      render: (v: string) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {v ? new Date(v).toLocaleString("zh-CN") : "-"}
        </Typography.Text>
      ),
    },
  ];

  const billingColumns = [
    { title: "事件", dataIndex: "eventType", key: "eventType", render: (v: string) => <Tag>{v}</Tag> },
    { title: "套餐", dataIndex: "planKey", key: "planKey", render: (v: string | null) => v ?? "-" },
    {
      title: "Credits 变动",
      dataIndex: "creditsDelta",
      key: "creditsDelta",
      render: (v: number) => (
        <Typography.Text type={v >= 0 ? "success" : "danger"}>
          {v >= 0 ? "+" : ""}
          {v.toLocaleString()}
        </Typography.Text>
      ),
    },
    {
      title: "时间",
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
      <Typography.Title level={4} style={{ marginBottom: 16 }}>
        翻译 新用户
      </Typography.Title>

      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} closable onClose={() => setError("")} />}

      <Space style={{ marginBottom: 16 }}>
        <Input
          prefix={<SearchOutlined />}
          placeholder="商店域名"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onPressEnter={() => load(search.trim() || undefined)}
          allowClear
          style={{ width: 260 }}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={() => load(search.trim() || undefined)}>
          查询
        </Button>
        <Button icon={<ReloadOutlined />} onClick={() => load(search.trim() || undefined)}>
          刷新
        </Button>
      </Space>

      <Spin spinning={loading}>
        <Table
          dataSource={shops}
          columns={columns}
          rowKey="shop"
          size="small"
          pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 个新用户` }}
        />
      </Spin>

      <Drawer
        title={activeShop}
        width={560}
        open={!!activeShop}
        onClose={() => setActiveShop(null)}
      >
        {detailLoading ? (
          <Spin />
        ) : detail ? (
          <>
            <Descriptions title="账本绑定" size="small" column={1} bordered style={{ marginBottom: 24 }}>
              <Descriptions.Item label="账本系统">{detail.binding?.billingSystem ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="判定原因">{detail.binding?.boundReason ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="注册时间">
                {detail.binding?.createdAt ? new Date(detail.binding.createdAt).toLocaleString("zh-CN") : "-"}
              </Descriptions.Item>
            </Descriptions>

            <Typography.Title level={5}>计费流水（最近 50 条）</Typography.Title>
            <Table
              dataSource={detail.billingLogs}
              columns={billingColumns}
              rowKey={(r, i) => `${r.createdAt}-${i}`}
              size="small"
              pagination={{ pageSize: 10 }}
            />
          </>
        ) : null}
      </Drawer>
    </div>
  );
}
