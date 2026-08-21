import { useEffect, useState, useCallback } from "react";
import {
  Table,
  Input,
  Tag,
  Typography,
  Spin,
  Alert,
  Drawer,
  Timeline,
  Tabs,
  Badge,
} from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { fetchShops, fetchShopEvents, type ShopRow } from "../api";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "success",
  PENDING: "processing",
  CANCELLED: "default",
  EXPIRED: "warning",
  FROZEN: "error",
};

function usageColor(pct: number) {
  if (pct >= 90) return "#ff4d4f";
  if (pct >= 70) return "#faad14";
  return "#52c41a";
}

export default function Shops() {
  const [shops, setShops] = useState<ShopRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ShopRow | null>(null);
  const [shopEvents, setShopEvents] = useState<{
    events: unknown[];
    billingLogs: unknown[];
  } | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);

  const load = useCallback((q: string) => {
    setLoading(true);
    fetchShops(q || undefined)
      .then((r) => setShops(r.shops))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load("");
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    setEventsLoading(true);
    fetchShopEvents(selected.shop)
      .then(setShopEvents)
      .finally(() => setEventsLoading(false));
  }, [selected]);

  const columns = [
    {
      title: "商店",
      dataIndex: "shop",
      key: "shop",
      render: (v: string) => (
        <Typography.Link
          onClick={() => setSelected(shops.find((s) => s.shop === v) ?? null)}
          style={{ fontSize: 13 }}
        >
          {v}
        </Typography.Link>
      ),
    },
    {
      title: "订阅状态",
      dataIndex: "subStatus",
      key: "subStatus",
      render: (v: string | null) =>
        v ? <Badge status={STATUS_COLORS[v] as never} text={v} /> : <Tag>无订阅</Tag>,
    },
    {
      title: "套餐",
      dataIndex: "planKey",
      key: "planKey",
      render: (v: string | null) => v ?? "-",
    },
    {
      title: "已用 / 订阅 Tokens",
      key: "tokens",
      render: (_: unknown, r: ShopRow) => {
        const total = r.subscriptionTokens + r.purchasedTokens + r.trialTokens;
        const pct = total > 0 ? Math.round((r.usedTokens / total) * 100) : 0;
        return (
          <span>
            <span style={{ color: usageColor(pct), fontWeight: 600 }}>
              {r.usedTokens.toLocaleString()}
            </span>
            {" / "}
            {total.toLocaleString()}
            <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
              ({pct}%)
            </Typography.Text>
          </span>
        );
      },
    },
    {
      title: "周期结束",
      dataIndex: "currentPeriodEnd",
      key: "currentPeriodEnd",
      render: (v: string | null) =>
        v ? (
          <Typography.Text style={{ fontSize: 12 }}>
            {new Date(v).toLocaleDateString("zh-CN")}
          </Typography.Text>
        ) : (
          "-"
        ),
    },
    {
      title: "最后活跃",
      dataIndex: "accountUpdatedAt",
      key: "accountUpdatedAt",
      render: (v: string) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {new Date(v).toLocaleString("zh-CN")}
        </Typography.Text>
      ),
    },
  ];

  if (error) return <Alert type="error" message={error} />;

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>
        商店列表
      </Typography.Title>
      <Input
        prefix={<SearchOutlined />}
        placeholder="搜索商店域名"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onPressEnter={() => load(search)}
        allowClear
        onClear={() => { setSearch(""); load(""); }}
        style={{ marginBottom: 16, maxWidth: 320 }}
      />
      <Spin spinning={loading}>
        <Table
          dataSource={shops}
          columns={columns}
          rowKey={(r) => `${r.shop}-${r.appName}`}
          size="small"
          pagination={{ pageSize: 20 }}
        />
      </Spin>

      <Drawer
        title={selected?.shop ?? ""}
        open={!!selected}
        onClose={() => setSelected(null)}
        width={560}
      >
        {eventsLoading ? (
          <Spin />
        ) : shopEvents ? (
          <Tabs
            items={[
              {
                key: "events",
                label: `生命周期事件 (${shopEvents.events.length})`,
                children: (
                  <Timeline
                    items={(shopEvents.events as Record<string, string>[]).map(
                      (e, i) => ({
                        key: i,
                        color:
                          e.eventType === "APP_INSTALLED"
                            ? "green"
                            : e.eventType === "APP_UNINSTALLED"
                              ? "red"
                              : "blue",
                        children: (
                          <div>
                            <Tag>{e.eventType}</Tag>
                            <Typography.Text
                              type="secondary"
                              style={{ fontSize: 12, marginLeft: 8 }}
                            >
                              {new Date(e.createdAt).toLocaleString("zh-CN")}
                            </Typography.Text>
                          </div>
                        ),
                      }),
                    )}
                  />
                ),
              },
              {
                key: "billing",
                label: `计费记录 (${shopEvents.billingLogs.length})`,
                children: (
                  <Timeline
                    items={(
                      shopEvents.billingLogs as Record<string, unknown>[]
                    ).map((b, i) => ({
                      key: i,
                      color: "blue",
                      children: (
                        <div>
                          <Tag color="blue">{b.eventType as string}</Tag>
                          {b.planKey && <Tag>{b.planKey as string}</Tag>}
                          {b.tokensDelta != null && (
                            <Typography.Text
                              style={{
                                color:
                                  Number(b.tokensDelta) > 0
                                    ? "#52c41a"
                                    : "#ff4d4f",
                                marginLeft: 8,
                              }}
                            >
                              {Number(b.tokensDelta) > 0 ? "+" : ""}
                              {Number(b.tokensDelta).toLocaleString()} tokens
                            </Typography.Text>
                          )}
                          <br />
                          <Typography.Text
                            type="secondary"
                            style={{ fontSize: 12 }}
                          >
                            {new Date(b.createdAt as string).toLocaleString(
                              "zh-CN",
                            )}
                          </Typography.Text>
                        </div>
                      ),
                    }))}
                  />
                ),
              },
            ]}
          />
        ) : null}
      </Drawer>
    </div>
  );
}
