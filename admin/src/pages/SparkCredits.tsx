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
  GiftOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import {
  adjustSparkSystemReward,
  fetchSparkCredits,
  type SparkCreditsBillingLog,
  type SparkCreditsData,
  type SparkCreditsPeriodHistory,
} from "../api";

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

function eventLabel(eventType: string): string {
  const map: Record<string, string> = {
    TRIAL_GRANTED: "试用发放",
    SUBSCRIPTION_ACTIVATED: "订阅开通",
    SUBSCRIPTION_RENEWED: "订阅续费",
    SUBSCRIPTION_CANCELLED: "订阅取消",
    TOKEN_PACK_INITIATED: "购包待确认",
    TOKEN_PACK_PURCHASED: "购包入账",
    PROMO_TOKEN_CLAIMED: "限时福利领取",
    SYSTEM_REWARD: "系统奖励",
    CREDIT_MIGRATION_IN: "从翻译迁入",
    CREDIT_MIGRATION_FAILED: "翻译迁入失败",
    CREDIT_MIGRATION_ROLLBACK: "翻译迁入回滚",
  };
  return map[eventType] ?? eventType;
}

type AdjustMode = "add" | "set";

export default function SparkCredits() {
  const [shopInput, setShopInput] = useState("");
  const [data, setData] = useState<SparkCreditsData | null>(null);
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
    fetchSparkCredits(trimmed)
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
    setAdjustAmount(mode === "set" ? account.purchasedTokens : null);
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
      adjustMode === "add" ? account.purchasedTokens + adjustAmount : adjustAmount;
    if (previewAfter < 0) {
      message.warning(`结果额度不能为负（将变为 ${previewAfter.toLocaleString()}）`);
      return;
    }

    setAdjusting(true);
    try {
      const result = await adjustSparkSystemReward({
        shop: account.shop,
        action: adjustMode,
        amount: adjustAmount,
        note: adjustNote.trim() || undefined,
      });
      message.success(
        `系统奖励已入账：${result.before.toLocaleString()} → ${result.after.toLocaleString()}（${
          result.tokensDelta >= 0 ? "+" : ""
        }${result.tokensDelta.toLocaleString()}）` +
          (result.referenceId ? ` · ${result.referenceId}` : ""),
      );
      setAdjustOpen(false);
      load(account.shop);
    } catch (e) {
      message.error(String(e));
    } finally {
      setAdjusting(false);
    }
  }

  const logColumns = [
    {
      title: "事件",
      dataIndex: "eventType",
      key: "eventType",
      render: (v: string) => (
        <Tag
          color={
            v === "SYSTEM_REWARD"
              ? "purple"
              : v === "CREDIT_MIGRATION_IN"
                ? "green"
                : v === "CREDIT_MIGRATION_FAILED"
                  ? "red"
                  : v === "CREDIT_MIGRATION_ROLLBACK"
                    ? "orange"
                    : "default"
          }
        >
          {eventLabel(v)}
        </Tag>
      ),
    },
    {
      title: "Token Δ",
      dataIndex: "tokensDelta",
      key: "tokensDelta",
      render: (v: number) => (
        <Typography.Text style={{ color: v >= 0 ? "#1677ff" : "#cf1322" }}>
          {v >= 0 ? "+" : ""}
          {v.toLocaleString()}
        </Typography.Text>
      ),
    },
    {
      title: "参考号",
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
      render: (v: string) => fmtDate(v),
    },
  ];

  const periodColumns = [
    {
      title: "周期",
      key: "period",
      render: (_: unknown, r: SparkCreditsPeriodHistory) =>
        `${fmtDate(r.periodStart)} → ${fmtDate(r.periodEnd)}`,
    },
    {
      title: "已用",
      dataIndex: "usedTokens",
      key: "usedTokens",
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "订阅分配",
      dataIndex: "subscriptionTokensAllocated",
      key: "subscriptionTokensAllocated",
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "按量剩余",
      dataIndex: "purchasedTokensRemaining",
      key: "purchasedTokensRemaining",
      render: (v: number) => v.toLocaleString(),
    },
  ];

  return (
    <div>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        <WalletOutlined /> 用户额度查询
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        查询 Spark 账户三池额度。手动调整写入按量池（purchasedTokens），BillingLog 记为「系统奖励」，与限时福利入账池一致。
      </Typography.Paragraph>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="shop.myshopify.com"
            value={shopInput}
            onChange={(e) => setShopInput(e.target.value)}
            onPressEnter={() => load(shopInput)}
            style={{ width: 320 }}
            allowClear
          />
          <Button
            type="primary"
            icon={<SearchOutlined />}
            loading={loading}
            onClick={() => load(shopInput)}
          >
            查询
          </Button>
          {account ? (
            <Button icon={<ReloadOutlined />} onClick={() => load(account.shop)}>
              刷新
            </Button>
          ) : null}
        </Space>
      </Card>

      {error ? (
        <Alert type="error" message={error} style={{ marginBottom: 16 }} closable onClose={() => setError("")} />
      ) : null}

      <Spin spinning={loading}>
        {!searched ? (
          <Empty description="输入商店域名开始查询" />
        ) : !account ? (
          <Empty description={`未找到账户：${data?.queriedShop ?? shopInput}`} />
        ) : (
          <>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col xs={24} sm={12} lg={8}>
                <Card>
                  <Statistic title="可用 Token" value={account.remainingTokens} />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={8}>
                <Card>
                  <Statistic title="订阅池" value={account.subscriptionTokens} />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={8}>
                <Card>
                  <Statistic title="按量池（可调）" value={account.purchasedTokens} />
                </Card>
              </Col>
            </Row>

            <Card
              title="账户摘要"
              size="small"
              style={{ marginBottom: 16 }}
              extra={
                <Space>
                  <Button
                    type="primary"
                    icon={<GiftOutlined />}
                    disabled={!canAdjust}
                    onClick={() => openAdjust("add")}
                  >
                    发放系统奖励
                  </Button>
                  <Button
                    icon={<EditOutlined />}
                    disabled={!canAdjust}
                    onClick={() => openAdjust("set")}
                  >
                    设定按量额度
                  </Button>
                </Space>
              }
            >
              <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }}>
                <Descriptions.Item label="商店">
                  <Typography.Text copyable>{account.shop}</Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="套餐">{account.planKey ?? "-"}</Descriptions.Item>
                <Descriptions.Item label="订阅状态">
                  {account.subStatus ? <Tag color="green">{account.subStatus}</Tag> : "-"}
                </Descriptions.Item>
                <Descriptions.Item label="周期结束">
                  {fmtDate(account.currentPeriodEnd)}
                </Descriptions.Item>
                <Descriptions.Item label="已用 / 总量">
                  {account.usedTokens.toLocaleString()} / {account.totalTokens.toLocaleString()}
                </Descriptions.Item>
                <Descriptions.Item label="用量">
                  <Progress
                    percent={account.usagePercent}
                    size="small"
                    strokeColor={usageColor(account.usagePercent)}
                    style={{ maxWidth: 180 }}
                  />
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Card title="系统奖励记录" size="small" style={{ marginBottom: 16 }}>
              <Table<SparkCreditsBillingLog>
                dataSource={data?.systemRewards ?? []}
                columns={logColumns}
                rowKey={(r) => `${r.referenceId ?? r.createdAt}-${r.tokensDelta}`}
                size="small"
                pagination={{ pageSize: 8 }}
                locale={{ emptyText: "暂无系统奖励记录" }}
              />
            </Card>

            <Card title="BillingLog（最近）" size="small" style={{ marginBottom: 16 }}>
              <Table<SparkCreditsBillingLog>
                dataSource={data?.billingLogs ?? []}
                columns={logColumns}
                rowKey={(r) => `${r.eventType}-${r.createdAt}-${r.referenceId ?? ""}`}
                size="small"
                pagination={{ pageSize: 10 }}
              />
            </Card>

            <Card title="周期归档" size="small">
              <Table<SparkCreditsPeriodHistory>
                dataSource={data?.periodHistory ?? []}
                columns={periodColumns}
                rowKey={(r) => `${r.periodStart}-${r.periodEnd}`}
                size="small"
                pagination={{ pageSize: 6 }}
                locale={{ emptyText: "暂无周期归档" }}
              />
            </Card>
          </>
        )}
      </Spin>

      <Modal
        title={adjustMode === "add" ? "发放系统奖励" : "设定按量额度"}
        open={adjustOpen}
        onCancel={() => setAdjustOpen(false)}
        onOk={submitAdjust}
        confirmLoading={adjusting}
        okText={adjustMode === "add" ? "发放" : "保存"}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          调整 <strong>purchasedTokens</strong>（按量池），与限时福利同一入账池。将写入 BillingLog：
          <Tag color="purple" style={{ marginLeft: 6 }}>
            系统奖励 SYSTEM_REWARD
          </Tag>
        </Typography.Paragraph>
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <div>
            <Typography.Text>
              {adjustMode === "add" ? "添加 Token 数量" : "目标按量额度"}
            </Typography.Text>
            <InputNumber
              style={{ width: "100%", marginTop: 4 }}
              value={adjustAmount}
              onChange={(v) => setAdjustAmount(typeof v === "number" ? v : null)}
              min={adjustMode === "set" ? 0 : undefined}
            />
          </div>
          {account && adjustAmount != null ? (
            <Alert
              type="info"
              showIcon
              message={`当前按量 ${account.purchasedTokens.toLocaleString()} → 调整后 ${
                adjustMode === "add"
                  ? (account.purchasedTokens + adjustAmount).toLocaleString()
                  : adjustAmount.toLocaleString()
              }`}
            />
          ) : null}
          <div>
            <Typography.Text>备注（可选）</Typography.Text>
            <Input.TextArea
              style={{ marginTop: 4 }}
              rows={2}
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
              placeholder="例如：客服补偿 / 内测加赠"
              maxLength={500}
            />
          </div>
          {adjustMode === "add" ? (
            <Button
              type="link"
              icon={<PlusOutlined />}
              style={{ padding: 0 }}
              onClick={() => setAdjustMode("set")}
            >
              改为设定目标值
            </Button>
          ) : (
            <Button type="link" style={{ padding: 0 }} onClick={() => setAdjustMode("add")}>
              改为增量发放
            </Button>
          )}
        </Space>
      </Modal>
    </div>
  );
}
