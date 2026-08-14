import { useCallback, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  InputNumber,
  Modal,
  Progress,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import {
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import {
  adjustTsfPurchasedCredits,
  fetchTsfCredits,
  type TsfCreditsAdjustMetadata,
  type TsfCreditsBillingLog,
  type TsfCreditsData,
  type TsfCreditsPackPurchase,
  type TsfCreditsPeriodHistory,
} from "../../api";

function usageColor(pct: number): string {
  if (pct >= 90) return "#ff4d4f";
  if (pct >= 70) return "#faad14";
  return "#52c41a";
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("zh-CN");
}

function fmtAdjustDetail(metadata: TsfCreditsAdjustMetadata | null): string {
  if (!metadata) return "-";
  const parts: string[] = [];
  if (typeof metadata.before === "number" && typeof metadata.after === "number") {
    parts.push(`${metadata.before.toLocaleString()} → ${metadata.after.toLocaleString()}`);
  }
  if (metadata.action) {
    parts.push(metadata.action === "add" ? "添加" : "修改");
  }
  if (metadata.note) {
    parts.push(`备注：${metadata.note}`);
  }
  if (metadata.operatorRole) {
    parts.push(`操作者：${metadata.operatorRole}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "-";
}

type AdjustMode = "add" | "set";

export default function TsfCredits() {
  const [shopInput, setShopInput] = useState("");
  const [data, setData] = useState<TsfCreditsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustMode, setAdjustMode] = useState<AdjustMode>("add");
  const [adjustAmount, setAdjustAmount] = useState<number | null>(null);
  const [adjustNote, setAdjustNote] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  const load = useCallback((shop: string) => {
    const trimmed = shop.trim();
    if (!trimmed) {
      setError("请输入商店域名");
      return;
    }
    setLoading(true);
    setError("");
    setSearched(true);
    fetchTsfCredits(trimmed)
      .then(setData)
      .catch((e) => {
        setData(null);
        setError(String(e));
      })
      .finally(() => setLoading(false));
  }, []);

  const account = data?.account ?? null;
  const canAdjust = Boolean(account);

  function openAdjust(mode: AdjustMode) {
    if (!account) {
      message.warning("请先查询到有效账户");
      return;
    }
    setAdjustMode(mode);
    setAdjustAmount(mode === "set" ? account.purchasedCredits : null);
    setAdjustNote("");
    setAdjustOpen(true);
  }

  async function submitAdjust() {
    if (!account) return;
    if (adjustAmount === null || Number.isNaN(adjustAmount)) {
      message.warning(adjustMode === "add" ? "请输入添加数量" : "请输入目标额度");
      return;
    }
    if (adjustMode === "add" && adjustAmount === 0) {
      message.warning("添加数量不能为 0");
      return;
    }
    if (adjustMode === "set" && adjustAmount < 0) {
      message.warning("目标额度不能为负");
      return;
    }

    const previewAfter =
      adjustMode === "add" ? account.purchasedCredits + adjustAmount : adjustAmount;
    if (previewAfter < 0) {
      message.warning(`结果额度不能为负（将变为 ${previewAfter.toLocaleString()}）`);
      return;
    }

    setAdjusting(true);
    try {
      const result = await adjustTsfPurchasedCredits({
        shop: account.shop,
        action: adjustMode,
        amount: adjustAmount,
        note: adjustNote.trim() || undefined,
      });
      message.success(
        `加购额度已更新：${result.before.toLocaleString()} → ${result.after.toLocaleString()}（${
          result.creditsDelta >= 0 ? "+" : ""
        }${result.creditsDelta.toLocaleString()}）` +
          (result.referenceId ? ` · 对账单号 ${result.referenceId}` : ""),
      );
      setAdjustOpen(false);
      load(account.shop);
    } catch (e) {
      message.error(String(e));
    } finally {
      setAdjusting(false);
    }
  }

  const packColumns = [
    {
      title: "流量包",
      key: "pack",
      render: (_: unknown, r: TsfCreditsPackPurchase) => (
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
          +{v.toLocaleString()}
        </Typography.Text>
      ),
    },
    {
      title: "金额",
      key: "price",
      render: (_: unknown, r: TsfCreditsPackPurchase) =>
        r.priceAmount > 0 ? `${r.currencyCode} ${r.priceAmount}` : "-",
    },
    {
      title: "参考单号",
      dataIndex: "referenceId",
      key: "referenceId",
      render: (v: string | null) =>
        v ? (
          <Typography.Text copyable style={{ fontSize: 12 }}>
            {v}
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
          {fmtDate(v)}
        </Typography.Text>
      ),
    },
  ];

  const adminAdjustColumns = [
    {
      title: "操作",
      dataIndex: "metadata",
      key: "action",
      render: (metadata: TsfCreditsAdjustMetadata | null) => {
        const action = metadata?.action;
        if (action === "add") return <Tag color="green">添加</Tag>;
        if (action === "set") return <Tag color="blue">修改</Tag>;
        return <Tag>运维调整</Tag>;
      },
    },
    {
      title: "额度变动",
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
      title: "调整前后",
      dataIndex: "metadata",
      key: "beforeAfter",
      render: (metadata: TsfCreditsAdjustMetadata | null) => {
        if (typeof metadata?.before !== "number" || typeof metadata?.after !== "number") {
          return "-";
        }
        return (
          <Typography.Text>
            {metadata.before.toLocaleString()} → {metadata.after.toLocaleString()}
          </Typography.Text>
        );
      },
    },
    {
      title: "对账详情",
      dataIndex: "metadata",
      key: "detail",
      render: (metadata: TsfCreditsAdjustMetadata | null) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {fmtAdjustDetail(metadata)}
        </Typography.Text>
      ),
    },
    {
      title: "参考单号",
      dataIndex: "referenceId",
      key: "referenceId",
      render: (v: string | null) =>
        v ? (
          <Typography.Text copyable style={{ fontSize: 12 }}>
            {v}
          </Typography.Text>
        ) : (
          "-"
        ),
    },
    {
      title: "时间",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (v: string) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {fmtDate(v)}
        </Typography.Text>
      ),
    },
  ];

  const billingColumns = [
    {
      title: "事件",
      dataIndex: "eventType",
      key: "eventType",
      render: (v: string) => (
        <Tag color={v === "ADMIN_PURCHASED_CREDITS_ADJUSTED" ? "purple" : undefined}>{v}</Tag>
      ),
    },
    {
      title: "套餐",
      dataIndex: "planKey",
      key: "planKey",
      render: (v: string | null) => v ?? "-",
    },
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
      title: "对账详情",
      dataIndex: "metadata",
      key: "metadata",
      render: (metadata: TsfCreditsAdjustMetadata | null, r: TsfCreditsBillingLog) =>
        r.eventType === "ADMIN_PURCHASED_CREDITS_ADJUSTED" ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {fmtAdjustDetail(metadata)}
          </Typography.Text>
        ) : (
          "-"
        ),
    },
    {
      title: "当时已用",
      dataIndex: "usedCredits",
      key: "usedCredits",
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "时间",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (v: string) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {fmtDate(v)}
        </Typography.Text>
      ),
    },
  ];

  const historyColumns = [
    {
      title: "周期",
      key: "period",
      render: (_: unknown, r: TsfCreditsPeriodHistory) => (
        <Typography.Text style={{ fontSize: 12 }}>
          {fmtDate(r.periodStart)} ~ {fmtDate(r.periodEnd)}
        </Typography.Text>
      ),
    },
    {
      title: "套餐",
      dataIndex: "planKey",
      key: "planKey",
      render: (v: string | null) => (v ? <Tag color="blue">{v}</Tag> : "-"),
    },
    {
      title: "已用",
      dataIndex: "usedCredits",
      key: "usedCredits",
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "订阅分配",
      dataIndex: "subscriptionCreditsAllocated",
      key: "subscriptionCreditsAllocated",
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "加购剩余",
      dataIndex: "purchasedCreditsRemaining",
      key: "purchasedCreditsRemaining",
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "归档时间",
      dataIndex: "archivedAt",
      key: "archivedAt",
      render: (v: string) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {fmtDate(v)}
        </Typography.Text>
      ),
    },
  ];

  const previewAfter =
    account && adjustAmount !== null
      ? adjustMode === "add"
        ? account.purchasedCredits + adjustAmount
        : adjustAmount
      : null;

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 8 }}>
        <WalletOutlined style={{ marginRight: 8 }} />
        用户额度查询
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        按商店域名查询 TSF Turso 中的当前额度、加购积分与计费流水。
      </Typography.Paragraph>

      {error && (
        <Alert
          type="error"
          message={error}
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setError("")}
        />
      )}

      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          prefix={<SearchOutlined />}
          placeholder="商店域名，如 example 或 example.myshopify.com"
          value={shopInput}
          onChange={(e) => setShopInput(e.target.value)}
          onPressEnter={() => load(shopInput)}
          allowClear
          style={{ width: 360 }}
        />
        <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={() => load(shopInput)}>
          查询
        </Button>
        <Button
          icon={<ReloadOutlined />}
          disabled={!shopInput.trim()}
          loading={loading}
          onClick={() => load(shopInput)}
        >
          刷新
        </Button>
        <Button
          icon={<PlusOutlined />}
          disabled={!canAdjust || loading}
          onClick={() => openAdjust("add")}
        >
          添加加购额度
        </Button>
        <Button
          icon={<EditOutlined />}
          disabled={!canAdjust || loading}
          onClick={() => openAdjust("set")}
        >
          修改加购额度
        </Button>
      </Space>

      <Spin spinning={loading}>
        {!searched ? (
          <Empty description="输入商店域名后点击查询" />
        ) : !account ? (
          <Alert
            type="warning"
            showIcon
            message={`未找到账户：${data?.queriedShop ?? shopInput}`}
            description="该商店在 TSF Turso Account 表中无记录（可能尚未成为 TSF 新用户账本）。"
          />
        ) : (
          <>
            <Card size="small" style={{ marginBottom: 16 }}>
              <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }}>
                <Descriptions.Item label="商店">
                  <Typography.Text copyable>{account.shop}</Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="状态">
                  {account.installed ? (
                    <Tag color="green">在装</Tag>
                  ) : (
                    <Tag color="volcano">已卸载</Tag>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="套餐">
                  {account.planKey ? <Tag color="blue">{account.planKey}</Tag> : "-"}
                </Descriptions.Item>
                <Descriptions.Item label="订阅状态">
                  {account.subStatus ? (
                    <Tag color={account.subStatus === "ACTIVE" ? "green" : "default"}>
                      {account.subStatus}
                    </Tag>
                  ) : (
                    "-"
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="计费周期">{account.billingInterval ?? "-"}</Descriptions.Item>
                <Descriptions.Item label="周期结束">{fmtDate(account.currentPeriodEnd)}</Descriptions.Item>
                <Descriptions.Item label="注册时间">{fmtDate(account.createdAt)}</Descriptions.Item>
                <Descriptions.Item label="额度更新">{fmtDate(account.updatedAt)}</Descriptions.Item>
                <Descriptions.Item label="试用结束">{fmtDate(account.trialEndsAt)}</Descriptions.Item>
              </Descriptions>
            </Card>

            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
              <Col xs={24} sm={12} md={6}>
                <Card>
                  <Statistic title="剩余 Credits" value={account.remainingCredits} />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Card>
                  <Statistic title="已用 Credits" value={account.usedCredits} />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Card>
                  <Statistic title="总量 Credits" value={account.totalCredits} />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Card>
                  <Statistic title="使用率" value={account.usagePercent} suffix="%" />
                  <Progress
                    percent={account.usagePercent}
                    size="small"
                    strokeColor={usageColor(account.usagePercent)}
                    showInfo={false}
                    style={{ marginTop: 8 }}
                  />
                </Card>
              </Col>
            </Row>

            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
              <Col xs={24} sm={8}>
                <Card size="small">
                  <Statistic title="订阅额度" value={account.subscriptionCredits} />
                </Card>
              </Col>
              <Col xs={24} sm={8}>
                <Card size="small">
                  <Statistic title="加购额度" value={account.purchasedCredits} />
                </Card>
              </Col>
              <Col xs={24} sm={8}>
                <Card size="small">
                  <Statistic title="试用额度" value={account.trialCredits} />
                </Card>
              </Col>
            </Row>

            <Card
              title="加购流量包"
              size="small"
              style={{ marginBottom: 16 }}
              extra={
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  共 {data?.packStats.totalPurchases ?? 0} 笔 · 累计 +
                  {(data?.packStats.totalCreditsGranted ?? 0).toLocaleString()} Credits
                </Typography.Text>
              }
            >
              <Table<TsfCreditsPackPurchase>
                dataSource={data?.packPurchases ?? []}
                columns={packColumns}
                rowKey={(r, i) => `${r.referenceId ?? r.createdAt}-${i}`}
                size="small"
                pagination={false}
                locale={{ emptyText: "无加购记录" }}
              />
            </Card>

            <Card
              title="运维调整记录（对账）"
              size="small"
              style={{ marginBottom: 16 }}
              extra={
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  共 {data?.adminAdjustments.length ?? 0} 条 · 事件 ADMIN_PURCHASED_CREDITS_ADJUSTED
                </Typography.Text>
              }
            >
              <Table<TsfCreditsBillingLog>
                dataSource={data?.adminAdjustments ?? []}
                columns={adminAdjustColumns}
                rowKey={(r, i) => `${r.referenceId ?? r.createdAt}-${i}`}
                size="small"
                pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 条` }}
                locale={{ emptyText: "暂无运维调整记录" }}
              />
            </Card>

            <Card title="计费流水（最近 100 条）" size="small" style={{ marginBottom: 16 }}>
              <Table<TsfCreditsBillingLog>
                dataSource={data?.billingLogs ?? []}
                columns={billingColumns}
                rowKey={(r, i) => `${r.eventType}-${r.createdAt}-${i}`}
                size="small"
                pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
                locale={{ emptyText: "无计费流水" }}
              />
            </Card>

            <Card title="周期用量归档" size="small">
              <Table<TsfCreditsPeriodHistory>
                dataSource={data?.periodHistory ?? []}
                columns={historyColumns}
                rowKey={(r, i) => `${r.periodEnd}-${i}`}
                size="small"
                pagination={false}
                locale={{ emptyText: "暂无归档记录" }}
              />
            </Card>
          </>
        )}
      </Spin>

      <Modal
        title={adjustMode === "add" ? "添加加购额度" : "修改加购额度"}
        open={adjustOpen}
        onCancel={() => {
          if (adjusting) return;
          setAdjustOpen(false);
        }}
        onOk={submitAdjust}
        okText={adjustMode === "add" ? "确认添加" : "确认修改"}
        cancelText="取消"
        confirmLoading={adjusting}
        destroyOnClose
      >
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Typography.Text type="secondary">
            商店：{account?.shop ?? "-"} · 当前加购额度：
            {(account?.purchasedCredits ?? 0).toLocaleString()}
          </Typography.Text>
          <div>
            <div style={{ marginBottom: 6 }}>
              {adjustMode === "add" ? "添加数量（可为负数）" : "目标加购额度（绝对值）"}
            </div>
            <InputNumber
              style={{ width: "100%" }}
              value={adjustAmount}
              onChange={(v) => setAdjustAmount(typeof v === "number" ? v : null)}
              disabled={adjusting}
              precision={0}
              min={adjustMode === "set" ? 0 : undefined}
              placeholder={adjustMode === "add" ? "例如 100000" : "例如 500000"}
            />
          </div>
          {previewAfter !== null && (
            <Alert
              type={previewAfter < 0 ? "error" : "info"}
              showIcon
              message={`调整后加购额度：${previewAfter.toLocaleString()}`}
            />
          )}
          <div>
            <div style={{ marginBottom: 6 }}>备注（可选）</div>
            <Input.TextArea
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
              disabled={adjusting}
              maxLength={500}
              showCount
              autoSize={{ minRows: 2, maxRows: 4 }}
              placeholder="例如：客服补偿 / 对账修正"
            />
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            成功后写入 BillingLog 事件 ADMIN_PURCHASED_CREDITS_ADJUSTED（含调整前后、操作者），不会计入加购收入统计。
          </Typography.Text>
        </Space>
      </Modal>
    </div>
  );
}
