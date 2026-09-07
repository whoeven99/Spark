import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Input,
  Popconfirm,
  Space,
  Table,
  Typography,
  message,
} from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  addDevStoreAllowlist,
  deleteDevStoreAllowlist,
  fetchDevStoreAllowlist,
  type DevStoreAllowlistItem,
} from "../api";

function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("zh-CN");
}

export function DevStoreAllowlistCard() {
  const [items, setItems] = useState<DevStoreAllowlistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shop, setShop] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetchDevStoreAllowlist()
      .then((data) => setItems(data.items))
      .catch((err) => {
        setItems([]);
        setError(String(err));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submitAdd() {
    setSaving(true);
    try {
      const created = await addDevStoreAllowlist({
        shop: shop.trim(),
        note: note.trim() || undefined,
      });
      message.success(`已加入 ${created.shop}`);
      setShop("");
      setNote("");
      load();
    } catch (err) {
      message.error(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function submitDelete(row: DevStoreAllowlistItem) {
    try {
      await deleteDevStoreAllowlist(row.id);
      message.success(`已移除 ${row.shop}`);
      load();
    } catch (err) {
      message.error(String(err));
    }
  }

  return (
    <Card
      title="开发店订阅白名单"
      style={{ marginTop: 24 }}
      extra={
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          刷新
        </Button>
      }
    >
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        正式环境（NODE_ENV=prod）默认禁止 Partner 开发店订阅套餐，避免用测试计费刷推荐码。把你自己的开发店加进来后可以照常订阅。
      </Typography.Paragraph>

      {error ? (
        <Alert
          type="error"
          message={error}
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setError("")}
        />
      ) : null}

      <Space wrap style={{ marginBottom: 16 }} align="start">
        <Input
          style={{ width: 280 }}
          value={shop}
          onChange={(event) => setShop(event.target.value)}
          placeholder="your-store.myshopify.com"
          onPressEnter={() => void submitAdd()}
        />
        <Input
          style={{ width: 200 }}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="备注（可选）"
          maxLength={200}
        />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => void submitAdd()}
          loading={saving}
        >
          加入
        </Button>
      </Space>

      <Table<DevStoreAllowlistItem>
        dataSource={items}
        loading={loading}
        rowKey="id"
        size="small"
        pagination={false}
        locale={{ emptyText: "暂无白名单店铺" }}
        columns={[
          {
            title: "店铺",
            dataIndex: "shop",
            key: "shop",
            render: (value: string) => (
              <Typography.Text copyable={{ text: value }}>{value}</Typography.Text>
            ),
          },
          {
            title: "备注",
            dataIndex: "note",
            key: "note",
            render: (value: string | null) => value || "—",
          },
          {
            title: "添加人",
            dataIndex: "createdBy",
            key: "createdBy",
            render: (value: string | null) => value || "—",
          },
          {
            title: "时间",
            dataIndex: "createdAt",
            key: "createdAt",
            render: (value: string) => fmtDate(value),
          },
          {
            title: "操作",
            key: "actions",
            width: 80,
            render: (_: unknown, row) => (
              <Popconfirm
                title={`从白名单移除 ${row.shop}？`}
                onConfirm={() => void submitDelete(row)}
              >
                <Button type="link" danger size="small">
                  移除
                </Button>
              </Popconfirm>
            ),
          },
        ]}
      />
    </Card>
  );
}
