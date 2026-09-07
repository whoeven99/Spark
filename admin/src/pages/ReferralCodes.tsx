import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Drawer,
  Input,
  InputNumber,
  Modal,
  Row,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import {
  CopyOutlined,
  GiftOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  createReferralCode,
  fetchReferralCodeClaims,
  fetchReferralCodes,
  updateReferralCode,
  type ReferralClaimItem,
  type ReferralCodeItem,
  type ReferralCodeListData,
  type ReferralCodeStatus,
} from "../api";
import { DevStoreAllowlistCard } from "./DevStoreAllowlistCard";

function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("zh-CN");
}

function statusLabel(status: ReferralCodeStatus): string {
  switch (status) {
    case "active":
      return "启用";
    case "disabled":
      return "停用";
    case "full":
      return "已满";
    case "scheduled":
      return "未开始";
    case "ended":
      return "已结束";
    default: {
      const _never: never = status;
      return _never;
    }
  }
}

function isUnlimitedCap(row: Pick<ReferralCodeItem, "maxUses" | "remaining" | "unlimited">): boolean {
  if (row.unlimited) return true;
  if (row.remaining == null) return true;
  return !(row.maxUses > 0);
}

function formatCap(row: ReferralCodeItem): string {
  return isUnlimitedCap(row) ? "不限" : row.maxUses.toLocaleString();
}

function formatRemaining(row: ReferralCodeItem): string {
  if (isUnlimitedCap(row)) return "不限";
  return (row.remaining ?? 0).toLocaleString();
}

function displayStatus(row: ReferralCodeItem): ReferralCodeStatus {
  if (isUnlimitedCap(row) && row.status === "full") {
    return row.enabled ? "active" : "disabled";
  }
  return row.status;
}

function statusColor(status: ReferralCodeStatus): string {
  switch (status) {
    case "active":
      return "green";
    case "disabled":
      return "default";
    case "full":
      return "orange";
    case "scheduled":
      return "blue";
    case "ended":
      return "red";
    default: {
      const _never: never = status;
      return _never;
    }
  }
}

export default function ReferralCodes() {
  const [data, setData] = useState<ReferralCodeListData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createCode, setCreateCode] = useState("");
  const [createNote, setCreateNote] = useState("");
  const [createAmount, setCreateAmount] = useState<number | null>(1_000_000);
  const [createMaxUses, setCreateMaxUses] = useState<number | null>(1_000_000);

  const [editRow, setEditRow] = useState<ReferralCodeItem | null>(null);
  const [editMaxUses, setEditMaxUses] = useState<number | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [detailRow, setDetailRow] = useState<ReferralCodeItem | null>(null);
  const [claims, setClaims] = useState<ReferralClaimItem[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetchReferralCodes()
      .then(setData)
      .catch((err) => {
        setData(null);
        setError(String(err));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function copyText(text: string, ok: string) {
    try {
      await navigator.clipboard.writeText(text);
      message.success(ok);
    } catch {
      message.error("复制失败");
    }
  }

  async function submitCreate() {
    if (createMaxUses == null || createMaxUses <= 0) {
      message.warning("使用上限须为正整数，默认 1000000");
      return;
    }
    if (createAmount == null || createAmount <= 0) {
      message.warning("请填写奖励 Token");
      return;
    }
    setCreating(true);
    try {
      const created = await createReferralCode({
        code: createCode.trim() || undefined,
        note: createNote.trim() || undefined,
        tokenAmount: createAmount,
        maxUses: createMaxUses,
      });
      message.success(`已创建 ${created.code}`);
      setCreateOpen(false);
      setCreateCode("");
      setCreateNote("");
      setCreateAmount(1_000_000);
      setCreateMaxUses(1_000_000);
      load();
    } catch (err) {
      message.error(String(err));
    } finally {
      setCreating(false);
    }
  }

  async function submitEdit() {
    if (!editRow) return;
    if (editMaxUses == null || editMaxUses <= 0) {
      message.warning("使用上限须为正整数");
      return;
    }
    if (editMaxUses < editRow.usedCount) {
      message.warning(`上限不能低于已兑 ${editRow.usedCount}`);
      return;
    }
    setSavingEdit(true);
    try {
      await updateReferralCode(editRow.id, { maxUses: editMaxUses });
      message.success("已更新使用上限");
      setEditRow(null);
      load();
    } catch (err) {
      message.error(String(err));
    } finally {
      setSavingEdit(false);
    }
  }

  async function toggleEnabled(row: ReferralCodeItem, enabled: boolean) {
    try {
      await updateReferralCode(row.id, { enabled });
      message.success(enabled ? `已启用 ${row.code}` : `已停用 ${row.code}`);
      load();
    } catch (err) {
      message.error(String(err));
    }
  }

  async function openClaims(row: ReferralCodeItem) {
    setDetailRow(row);
    setClaimsLoading(true);
    try {
      const claimResult = await fetchReferralCodeClaims(row.id);
      setClaims(claimResult.items);
    } catch (err) {
      setClaims([]);
      message.error(String(err));
    } finally {
      setClaimsLoading(false);
    }
  }

  return (
    <div>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        <GiftOutlined /> 推荐码
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        给广告投放用。安装链接是 Shopify 官方入口（admin.shopify.com/oauth/install?client_id=…），测/产各用对应应用的 client_id。订阅时填写同一推荐码，确认成功后才发 Token。一店只能兑一次。
      </Typography.Paragraph>

      <Space wrap style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          新建
        </Button>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          刷新
        </Button>
      </Space>

      {error ? (
        <Alert
          type="error"
          message={error}
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setError("")}
        />
      ) : null}

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic title="有效码数" value={data?.summary.activeCount ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic title="累计兑换" value={data?.summary.totalRedeemed ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              title="剩余名额"
              value={
                (data?.summary.unlimitedActiveCount ?? 0) > 0 &&
                (data?.summary.remainingSlots ?? 0) === 0
                  ? "不限"
                  : (data?.summary.remainingSlots ?? 0)
              }
              suffix={
                (data?.summary.unlimitedActiveCount ?? 0) > 0 &&
                (data?.summary.remainingSlots ?? 0) > 0
                  ? "+ 不限"
                  : undefined
              }
            />
          </Card>
        </Col>
      </Row>

      <Card size="small">
        <Table<ReferralCodeItem>
          dataSource={data?.items ?? []}
          loading={loading}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 20 }}
          columns={[
            {
              title: "推荐码",
              dataIndex: "code",
              key: "code",
              render: (code: string) => (
                <Space size={4}>
                  <Typography.Text copyable={{ text: code }}>{code}</Typography.Text>
                </Space>
              ),
            },
            {
              title: "备注",
              dataIndex: "note",
              key: "note",
              render: (value: string | null) => value || "-",
            },
            {
              title: "奖励 Token",
              dataIndex: "tokenAmount",
              key: "tokenAmount",
              render: (value: number) => value.toLocaleString(),
            },
            {
              title: "已兑 / 上限",
              key: "usage",
              render: (_: unknown, row) =>
                `${row.usedCount.toLocaleString()} / ${formatCap(row)}`,
            },
            {
              title: "剩余",
              key: "remaining",
              render: (_: unknown, row) => formatRemaining(row),
            },
            {
              title: "状态",
              key: "status",
              render: (_: unknown, row) => {
                const status = displayStatus(row);
                return <Tag color={statusColor(status)}>{statusLabel(status)}</Tag>;
              },
            },
            {
              title: "创建时间",
              dataIndex: "createdAt",
              key: "createdAt",
              render: (value: string) => fmtDate(value),
            },
            {
              title: "操作",
              key: "actions",
              render: (_: unknown, row) => (
                <Space size="small" wrap>
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => void copyText(row.code, `已复制 ${row.code}`)}
                  >
                    复制码
                  </Button>
                  <Button
                    size="small"
                    onClick={() =>
                      void copyText(
                        row.installUrl || `/r/${row.code}`,
                        "已复制安装链接",
                      )
                    }
                  >
                    复制安装链接
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      setEditRow(row);
                      setEditMaxUses(row.maxUses > 0 ? row.maxUses : 1_000_000);
                    }}
                  >
                    改上限
                  </Button>
                  <Switch
                    size="small"
                    checked={row.enabled}
                    onChange={(checked) => void toggleEnabled(row, checked)}
                    checkedChildren="启"
                    unCheckedChildren="停"
                  />
                  <Button size="small" type="link" onClick={() => void openClaims(row)}>
                    明细
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="新建推荐码"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void submitCreate()}
        confirmLoading={creating}
        okText="创建"
        destroyOnHidden
      >
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <div>
            <Typography.Text>推荐码（可留空自动生成）</Typography.Text>
            <Input
              style={{ marginTop: 4 }}
              value={createCode}
              onChange={(event) =>
                setCreateCode(event.target.value.toUpperCase().replace(/\s+/g, ""))
              }
              placeholder="例如 KOL-SEP"
              maxLength={20}
            />
          </div>
          <div>
            <Typography.Text>备注</Typography.Text>
            <Input
              style={{ marginTop: 4 }}
              value={createNote}
              onChange={(event) => setCreateNote(event.target.value)}
              placeholder="9 月 KOL"
              maxLength={200}
            />
          </div>
          <div>
            <Typography.Text>奖励 Token</Typography.Text>
            <InputNumber
              style={{ width: "100%", marginTop: 4 }}
              value={createAmount}
              min={1}
              onChange={(value) => setCreateAmount(typeof value === "number" ? value : null)}
            />
          </div>
          <div>
            <Typography.Text>使用上限（默认 1000000）</Typography.Text>
            <InputNumber
              style={{ width: "100%", marginTop: 4 }}
              value={createMaxUses}
              min={1}
              max={10_000_000}
              placeholder="1000000"
              onChange={(value) => setCreateMaxUses(typeof value === "number" ? value : 1_000_000)}
            />
          </div>
        </Space>
      </Modal>

      <Modal
        title={editRow ? `改上限 · ${editRow.code}` : "改上限"}
        open={Boolean(editRow)}
        onCancel={() => setEditRow(null)}
        onOk={() => void submitEdit()}
        confirmLoading={savingEdit}
        okText="保存"
        destroyOnHidden
      >
        {editRow ? (
          <Space direction="vertical" style={{ width: "100%" }} size="middle">
            <Alert
              type="info"
              showIcon
              message={`当前已兑 ${editRow.usedCount.toLocaleString()} 次。上限须为正整数，且不能低于已兑次数。`}
            />
            <InputNumber
              style={{ width: "100%" }}
              value={editMaxUses}
              min={1}
              max={10_000_000}
              placeholder="1000000"
              onChange={(value) => setEditMaxUses(typeof value === "number" ? value : 1_000_000)}
            />
          </Space>
        ) : null}
      </Modal>

      <Drawer
        title={detailRow ? `兑换明细 · ${detailRow.code}` : "兑换明细"}
        open={Boolean(detailRow)}
        onClose={() => {
          setDetailRow(null);
          setClaims([]);
        }}
        width={520}
      >
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          订阅兑换
        </Typography.Title>
        <Table<ReferralClaimItem>
          dataSource={claims}
          loading={claimsLoading}
          rowKey={(row) => `${row.shopHash}-${row.claimedAt ?? ""}`}
          size="small"
          pagination={{ pageSize: 12 }}
          locale={{ emptyText: "暂无兑换" }}
          columns={[
            {
              title: "店铺",
              key: "shop",
              render: (_: unknown, row) => {
                if (row.shop) {
                  return (
                    <Typography.Text
                      copyable={{ text: row.shop }}
                      ellipsis={{ tooltip: row.shop }}
                    >
                      {row.shop}
                    </Typography.Text>
                  );
                }
                const short = row.shopHashShort || row.shopHash.slice(0, 8);
                return (
                  <Tooltip title={row.shopHash}>
                    <Typography.Text
                      type="secondary"
                      copyable={{ text: row.shopHash }}
                    >
                      已卸载 · {short}
                    </Typography.Text>
                  </Tooltip>
                );
              },
            },
            {
              title: "Token",
              dataIndex: "tokensDelta",
              key: "tokensDelta",
              render: (value: number) => value.toLocaleString(),
            },
            {
              title: "时间",
              dataIndex: "claimedAt",
              key: "claimedAt",
              render: (value: string | null) => fmtDate(value),
            },
          ]}
        />
      </Drawer>

      <DevStoreAllowlistCard />
    </div>
  );
}
