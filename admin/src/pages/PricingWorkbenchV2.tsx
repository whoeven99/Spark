import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Divider,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Row,
  Space,
  Spin,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  notification,
} from "antd";
import {
  CloudSyncOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import {
  createMonthlyFixedCost,
  deleteMonthlyFixedCost,
  fetchBillingRules,
  fetchPricingWorkbenchV2,
  isOwner,
  updateBillingRule,
  updateMonthlyFixedCost,
  updatePricingWorkbenchV2Settings,
  type BillingRuleRow,
  type MonthlyFixedCostItem,
  type PlanCatalogItem,
} from "../api";
import {
  DEFAULT_SCENARIOS,
  calcFeatureRows,
  calcPlanMargins,
  calcReversePricing,
  calcTotals,
  type FeatureCalcRow,
  type FeatureScenario,
  type GlobalAssumptions,
} from "../lib/pricingCalc";

const USD = (v: number, digits = 2) =>
  Number.isFinite(v)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(v)
    : "-";

const NUM = (v: number) =>
  Number.isFinite(v)
    ? v.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : "-";

function marginColor(pct: number, target: number): string {
  if (pct >= target) return "#389e0d";
  if (pct >= target - 10) return "#d48806";
  return "#cf1322";
}

function parseScenarios(raw: unknown[] | null | undefined): FeatureScenario[] {
  if (!raw?.length) return DEFAULT_SCENARIOS;
  const parsed: FeatureScenario[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.name !== "string") continue;
    parsed.push({
      id: o.id,
      name: o.name,
      feature: String(o.feature ?? o.id),
      modelKey: String(o.modelKey ?? "_default"),
      callsPerUserPerMonth: Number(o.callsPerUserPerMonth ?? 0),
      inputTokensPerCall: Number(o.inputTokensPerCall ?? 0),
      outputTokensPerCall: Number(o.outputTokensPerCall ?? 0),
      priceInputPer1M: Number(o.priceInputPer1M ?? 0),
      priceOutputPer1M: Number(o.priceOutputPer1M ?? 0),
      flatCostPerCallUsd: Number(o.flatCostPerCallUsd ?? 0),
      multiplier: Number(o.multiplier ?? 1),
      baseTokenCost: Number(o.baseTokenCost ?? 0),
      enabled: o.enabled !== false,
    });
  }
  return parsed.length > 0 ? parsed : DEFAULT_SCENARIOS;
}

export default function PricingWorkbenchV2() {
  const owner = isOwner();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [payingShops, setPayingShops] = useState(100);
  const [targetGrossMarginPct, setTargetGrossMarginPct] = useState(70);
  const [shopifyRevSharePct, setShopifyRevSharePct] = useState(15);
  const [paymentFeePct, setPaymentFeePct] = useState(0);
  const [planPriceUsd, setPlanPriceUsd] = useState(29.99);
  const [tokenGrantPerUser, setTokenGrantPerUser] = useState(500_000);

  const [fixedCosts, setFixedCosts] = useState<MonthlyFixedCostItem[]>([]);
  const [scenarios, setScenarios] = useState<FeatureScenario[]>(DEFAULT_SCENARIOS);
  const [plans, setPlans] = useState<PlanCatalogItem[]>([]);
  const [billingRules, setBillingRules] = useState<BillingRuleRow[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);

  const [fixedModalOpen, setFixedModalOpen] = useState(false);
  const [newFixedName, setNewFixedName] = useState("");
  const [newFixedAmount, setNewFixedAmount] = useState(100);

  const fixedMonthly = useMemo(
    () => fixedCosts.filter((c) => c.enabled).reduce((s, c) => s + c.amountUsd, 0),
    [fixedCosts],
  );

  const assumptions: GlobalAssumptions = useMemo(
    () => ({
      payingShops,
      targetGrossMarginPct,
      shopifyRevSharePct,
      paymentFeePct,
      planPriceUsd,
      tokenGrantPerUser,
    }),
    [
      payingShops,
      targetGrossMarginPct,
      shopifyRevSharePct,
      paymentFeePct,
      planPriceUsd,
      tokenGrantPerUser,
    ],
  );

  const tokenDollarValue =
    planPriceUsd > 0 ? tokenGrantPerUser / planPriceUsd : 0;

  const featureRows = useMemo(
    () => calcFeatureRows(scenarios, tokenDollarValue),
    [scenarios, tokenDollarValue],
  );

  const totals = useMemo(
    () => calcTotals(featureRows, fixedMonthly, payingShops),
    [featureRows, fixedMonthly, payingShops],
  );

  const reverse = useMemo(
    () => calcReversePricing(assumptions, totals),
    [assumptions, totals],
  );

  const planMargins = useMemo(
    () => calcPlanMargins(plans, assumptions, totals),
    [plans, assumptions, totals],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchPricingWorkbenchV2();
      const s = data.settings;
      setPayingShops(s.payingShops);
      setTargetGrossMarginPct(s.targetGrossMarginPct);
      setShopifyRevSharePct(s.shopifyRevSharePct ?? 15);
      setPaymentFeePct(s.paymentFeePct ?? 0);
      setPlanPriceUsd(s.planPriceUsd);
      setTokenGrantPerUser(s.tokenGrantPerUser);
      setFixedCosts(data.fixedCosts);
      setPlans(data.plans ?? []);
      setScenarios(parseScenarios(s.usageScenarios));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRules = useCallback(async () => {
    setRulesLoading(true);
    try {
      const r = await fetchBillingRules();
      setBillingRules(r.rules);
    } catch (e) {
      notification.error({ message: String(e) });
    } finally {
      setRulesLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadRules();
  }, [load, loadRules]);

  function patchScenario(id: string, patch: Partial<FeatureScenario>) {
    setScenarios((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }

  function addScenario() {
    const id = `custom_${Date.now()}`;
    setScenarios((prev) => [
      ...prev,
      {
        id,
        name: "新能力",
        feature: "custom",
        modelKey: "_default",
        callsPerUserPerMonth: 10,
        inputTokensPerCall: 1000,
        outputTokensPerCall: 500,
        priceInputPer1M: 0.14,
        priceOutputPer1M: 0.28,
        flatCostPerCallUsd: 0,
        multiplier: 1,
        baseTokenCost: 0,
        enabled: true,
      },
    ]);
  }

  function syncFromBillingRules() {
    setScenarios((prev) =>
      prev.map((row) => {
        const rule =
          billingRules.find(
            (r) =>
              r.enabled &&
              r.feature === row.feature &&
              r.modelKey === row.modelKey,
          ) ??
          billingRules.find(
            (r) => r.enabled && r.feature === row.feature && r.modelKey === "_default",
          );
        if (!rule) return row;
        return {
          ...row,
          multiplier: rule.multiplier,
          baseTokenCost: rule.baseTokenCost ?? row.baseTokenCost,
          name: rule.displayName.split("·")[0]?.trim() || row.name,
        };
      }),
    );
    notification.success({ message: "已从 TokenBillingRule 同步倍率与定额" });
  }

  async function handleSave() {
    if (!owner) return;
    setSaving(true);
    try {
      await updatePricingWorkbenchV2Settings({
        payingShops,
        targetGrossMarginPct,
        planPriceUsd,
        tokenGrantPerUser,
        shopifyRevSharePct,
        paymentFeePct,
        usageScenarios: scenarios,
      });
      notification.success({ message: "工作台配置已保存" });
    } catch (e) {
      notification.error({ message: String(e) });
    } finally {
      setSaving(false);
    }
  }

  async function handleAddFixedCost() {
    if (!newFixedName.trim()) return;
    try {
      await createMonthlyFixedCost({
        name: newFixedName.trim(),
        amountUsd: newFixedAmount,
      });
      setFixedModalOpen(false);
      setNewFixedName("");
      setNewFixedAmount(100);
      await load();
      notification.success({ message: "固定成本项已添加" });
    } catch (e) {
      notification.error({ message: String(e) });
    }
  }

  async function toggleFixedCost(item: MonthlyFixedCostItem) {
    try {
      await updateMonthlyFixedCost(item.id, { enabled: !item.enabled });
      await load();
    } catch (e) {
      notification.error({ message: String(e) });
    }
  }

  async function removeFixedCost(id: string) {
    try {
      await deleteMonthlyFixedCost(id);
      await load();
      notification.success({ message: "已删除" });
    } catch (e) {
      notification.error({ message: String(e) });
    }
  }

  async function applyRuleSuggestion(rule: BillingRuleRow, row: FeatureScenario | undefined) {
    if (!owner) return;
    const calc = featureRows.find((r) => r.feature === rule.feature && r.modelKey === rule.modelKey)
      ?? featureRows.find((r) => r.feature === rule.feature);
    if (!calc) {
      notification.warning({ message: "工作台中无对应能力行，请先在能力模型中添加" });
      return;
    }
    try {
      await updateBillingRule(rule.ruleKey, {
        multiplier: calc.suggestedMultiplier,
        baseTokenCost: calc.suggestedBaseTokenCost > 0 ? calc.suggestedBaseTokenCost : null,
      });
      notification.success({ message: `已更新规则 ${rule.ruleKey}` });
      loadRules();
    } catch (e) {
      notification.error({ message: String(e) });
    }
  }

  const overviewTab = (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Row gutter={[16, 16]}>
        {[
          {
            label: "每计费 Token 成本",
            value: USD(totals.effectiveCostPerBilledToken, 6),
            sub: `变量 ${USD(totals.variableCostPerUser)} / 店 / 月`,
          },
          {
            label: "净收入（标价 − 平台费）",
            value: USD(reverse.netRevenueUsd),
            sub: `标价 ${USD(planPriceUsd)}，费率 ${shopifyRevSharePct + paymentFeePct}%`,
          },
          {
            label: "当前 Token 面值",
            value: `${NUM(reverse.currentTokenFaceValue)} / $`,
            sub: `安全上限 ${NUM(reverse.maxTokenFaceValue)} / $`,
          },
          {
            label: "模拟套餐毛利率",
            value: `${reverse.currentMarginPct.toFixed(1)}%`,
            sub: `目标 ${targetGrossMarginPct}%`,
            color: marginColor(reverse.currentMarginPct, targetGrossMarginPct),
          },
        ].map((kpi) => (
          <Col xs={24} sm={12} lg={6} key={kpi.label}>
            <Card size="small" style={{ height: "100%" }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {kpi.label}
              </Typography.Text>
              <Typography.Title
                level={4}
                style={{ margin: "6px 0 0", color: kpi.color }}
              >
                {kpi.value}
              </Typography.Title>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                {kpi.sub}
              </Typography.Text>
            </Card>
          </Col>
        ))}
      </Row>

      <Card title="反推模拟（主套餐探针）">
        <Row gutter={24}>
          <Col xs={24} lg={12}>
            <Typography.Text strong>A · 给定 Token，算建议标价</Typography.Text>
            <div style={{ marginTop: 8 }}>
              <Typography.Text type="secondary">发放 Token / 店 / 月</Typography.Text>
              <InputNumber
                style={{ width: "100%", marginTop: 4 }}
                min={0}
                step={10_000}
                value={tokenGrantPerUser}
                formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                parser={(v) => Number(v?.replace(/,/g, "") ?? 0)}
                onChange={(n) => setTokenGrantPerUser(Number(n ?? 0))}
              />
            </div>
            <Divider style={{ margin: "12px 0" }} />
            <Typography.Text type="secondary">固定成本分摊</Typography.Text>
            <div>{USD(totals.fixedPerUser)} / 店 / 月</div>
            <Typography.Text type="secondary" style={{ display: "block", marginTop: 8 }}>
              建议标价（含平台费还原）
            </Typography.Text>
            <Typography.Title level={3} style={{ margin: "4px 0" }}>
              {USD(reverse.suggestedPriceListUsd)}
            </Typography.Title>
          </Col>
          <Col xs={24} lg={12}>
            <Typography.Text strong>B · 给定标价，算建议 Token</Typography.Text>
            <div style={{ marginTop: 8 }}>
              <Typography.Text type="secondary">月费标价 (USD)</Typography.Text>
              <InputNumber
                style={{ width: "100%", marginTop: 4 }}
                min={0}
                step={0.01}
                precision={2}
                value={planPriceUsd}
                onChange={(n) => setPlanPriceUsd(Number(n ?? 0))}
              />
            </div>
            <Divider style={{ margin: "12px 0" }} />
            <Typography.Text type="secondary">建议发放 Token</Typography.Text>
            <Typography.Title level={3} style={{ margin: "4px 0" }}>
              {NUM(reverse.suggestedGrantForPrice)}
            </Typography.Title>
            <Progress
              percent={Math.min(
                100,
                tokenGrantPerUser > 0
                  ? (reverse.suggestedGrantForPrice / tokenGrantPerUser) * 100
                  : 0,
              )}
              format={() =>
                tokenGrantPerUser > 0
                  ? `${((reverse.suggestedGrantForPrice / tokenGrantPerUser) * 100).toFixed(0)}%`
                  : "0%"
              }
              strokeColor={
                reverse.currentMarginPct >= targetGrossMarginPct
                  ? "#52c41a"
                  : "#ff4d4f"
              }
            />
            <Typography.Text type="secondary">
              当前配置毛利率{" "}
              <span
                style={{
                  color: marginColor(reverse.currentMarginPct, targetGrossMarginPct),
                  fontWeight: 600,
                }}
              >
                {reverse.currentMarginPct.toFixed(1)}%
              </span>
            </Typography.Text>
          </Col>
        </Row>
      </Card>

      <Card title="全局假设">
        <Row gutter={[16, 16]}>
          <Col xs={12} md={6}>
            <Typography.Text type="secondary">付费商店数</Typography.Text>
            <InputNumber
              style={{ width: "100%", marginTop: 4 }}
              min={1}
              value={payingShops}
              onChange={(n) => setPayingShops(Number(n ?? 1))}
            />
          </Col>
          <Col xs={12} md={6}>
            <Typography.Text type="secondary">目标毛利率 (%)</Typography.Text>
            <InputNumber
              style={{ width: "100%", marginTop: 4 }}
              min={0}
              max={99}
              step={0.5}
              value={targetGrossMarginPct}
              onChange={(n) => setTargetGrossMarginPct(Number(n ?? 0))}
            />
          </Col>
          <Col xs={12} md={6}>
            <Typography.Text type="secondary">Shopify 分成 (%)</Typography.Text>
            <InputNumber
              style={{ width: "100%", marginTop: 4 }}
              min={0}
              max={99}
              step={0.5}
              value={shopifyRevSharePct}
              onChange={(n) => setShopifyRevSharePct(Number(n ?? 0))}
            />
          </Col>
          <Col xs={12} md={6}>
            <Typography.Text type="secondary">支付附加费 (%)</Typography.Text>
            <InputNumber
              style={{ width: "100%", marginTop: 4 }}
              min={0}
              max={99}
              step={0.1}
              value={paymentFeePct}
              onChange={(n) => setPaymentFeePct(Number(n ?? 0))}
            />
          </Col>
        </Row>
      </Card>

      <Card
        title={
          <Space>
            月固定成本
            <Tag>{USD(fixedMonthly)}/月</Tag>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              分摊 {USD(totals.fixedPerUser)}/店
            </Typography.Text>
          </Space>
        }
        extra={
          owner && (
            <Button icon={<PlusOutlined />} onClick={() => setFixedModalOpen(true)}>
              添加
            </Button>
          )
        }
      >
        <Table
          size="small"
          pagination={false}
          rowKey="id"
          dataSource={fixedCosts}
          columns={[
            { title: "项目", dataIndex: "name" },
            {
              title: "金额/月",
              dataIndex: "amountUsd",
              render: (v: number) => USD(v),
            },
            {
              title: "启用",
              dataIndex: "enabled",
              render: (v: boolean, r: MonthlyFixedCostItem) =>
                owner ? (
                  <Switch size="small" checked={v} onChange={() => toggleFixedCost(r)} />
                ) : (
                  <Tag color={v ? "green" : "default"}>{v ? "是" : "否"}</Tag>
                ),
            },
            ...(owner
              ? [
                  {
                    title: "",
                    render: (_: unknown, r: MonthlyFixedCostItem) => (
                      <Popconfirm title="删除此项？" onConfirm={() => removeFixedCost(r.id)}>
                        <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                      </Popconfirm>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Card>
    </Space>
  );

  const featureTab = (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Alert
        type="info"
        showIcon
        message="能力成本模型"
        description={
          <>
            每次 API 成本 = input×单价 + output×单价 + 固定美元成本；计费 Token 与线上一致（raw×multiplier 或
            baseTokenCost×multiplier）。综合加权后得到「每计费 Token 成本」，驱动套餐反推。
          </>
        }
      />
      <Space wrap>
        <Button icon={<PlusOutlined />} onClick={addScenario}>
          新增能力
        </Button>
        <Button icon={<SyncOutlined />} onClick={syncFromBillingRules}>
          从计费规则同步倍率
        </Button>
      </Space>
      <Table
        size="small"
        scroll={{ x: 2000 }}
        pagination={false}
        rowKey="id"
        dataSource={featureRows}
        columns={[
          {
            title: "启用",
            width: 56,
            render: (_: unknown, r: FeatureScenario) => (
              <Switch
                size="small"
                checked={r.enabled}
                onChange={(v) => patchScenario(r.id, { enabled: v })}
              />
            ),
          },
          {
            title: "能力",
            dataIndex: "name",
            width: 120,
            render: (v: string, r: FeatureScenario) => (
              <Input
                size="small"
                value={v}
                onChange={(e) => patchScenario(r.id, { name: e.target.value })}
              />
            ),
          },
          {
            title: "调用/月",
            width: 90,
            render: (_: unknown, r: FeatureScenario) => (
              <InputNumber
                size="small"
                min={0}
                value={r.callsPerUserPerMonth}
                onChange={(n) =>
                  patchScenario(r.id, { callsPerUserPerMonth: Number(n ?? 0) })
                }
              />
            ),
          },
          {
            title: "In/次",
            width: 80,
            render: (_: unknown, r: FeatureScenario) => (
              <InputNumber
                size="small"
                min={0}
                value={r.inputTokensPerCall}
                onChange={(n) =>
                  patchScenario(r.id, { inputTokensPerCall: Number(n ?? 0) })
                }
              />
            ),
          },
          {
            title: "Out/次",
            width: 80,
            render: (_: unknown, r: FeatureScenario) => (
              <InputNumber
                size="small"
                min={0}
                value={r.outputTokensPerCall}
                onChange={(n) =>
                  patchScenario(r.id, { outputTokensPerCall: Number(n ?? 0) })
                }
              />
            ),
          },
          {
            title: "$/1M In",
            width: 100,
            render: (_: unknown, r: FeatureScenario) => (
              <InputNumber
                size="small"
                min={0}
                step={0.01}
                value={r.priceInputPer1M}
                onChange={(n) =>
                  patchScenario(r.id, { priceInputPer1M: Number(n ?? 0) })
                }
              />
            ),
          },
          {
            title: "$/1M Out",
            width: 100,
            render: (_: unknown, r: FeatureScenario) => (
              <InputNumber
                size="small"
                min={0}
                step={0.01}
                value={r.priceOutputPer1M}
                onChange={(n) =>
                  patchScenario(r.id, { priceOutputPer1M: Number(n ?? 0) })
                }
              />
            ),
          },
          {
            title: "$/次固定",
            width: 100,
            render: (_: unknown, r: FeatureScenario) => (
              <InputNumber
                size="small"
                min={0}
                step={0.001}
                value={r.flatCostPerCallUsd}
                onChange={(n) =>
                  patchScenario(r.id, { flatCostPerCallUsd: Number(n ?? 0) })
                }
              />
            ),
          },
          {
            title: "倍率",
            width: 72,
            render: (_: unknown, r: FeatureScenario) => (
              <InputNumber
                size="small"
                min={0}
                step={0.1}
                value={r.multiplier}
                onChange={(n) => patchScenario(r.id, { multiplier: Number(n ?? 0) })}
              />
            ),
          },
          {
            title: "base",
            width: 80,
            render: (_: unknown, r: FeatureScenario) => (
              <InputNumber
                size="small"
                min={0}
                value={r.baseTokenCost}
                onChange={(n) =>
                  patchScenario(r.id, { baseTokenCost: Number(n ?? 0) })
                }
              />
            ),
          },
          {
            title: "$/次",
            width: 80,
            render: (_: unknown, r: FeatureCalcRow) => (
              <Tag color="blue">{USD(r.costPerCallUsd, 4)}</Tag>
            ),
          },
          {
            title: "计费/次",
            width: 88,
            render: (_: unknown, r: FeatureCalcRow) => NUM(r.billedTokensPerCall),
          },
          {
            title: "建议倍率",
            width: 88,
            render: (_: unknown, r: FeatureCalcRow) => (
              <Tooltip title="相对最便宜 LLM 能力的成本比">
                <Tag color={Math.abs(r.suggestedMultiplier - r.multiplier) > 0.2 ? "orange" : "default"}>
                  {r.suggestedMultiplier}x
                </Tag>
              </Tooltip>
            ),
          },
          {
            title: "建议 base",
            width: 96,
            render: (_: unknown, r: FeatureCalcRow) =>
              r.suggestedBaseTokenCost > 0 ? (
                <Tag color="purple">{NUM(r.suggestedBaseTokenCost)}</Tag>
              ) : (
                "-"
              ),
          },
          {
            title: "",
            width: 48,
            render: (_: unknown, r: FeatureScenario) => (
              <Button
                danger
                size="small"
                type="text"
                icon={<DeleteOutlined />}
                onClick={() =>
                  setScenarios((prev) => prev.filter((x) => x.id !== r.id))
                }
              />
            ),
          },
        ]}
      />
      <Row gutter={16}>
        <Col span={8}>
          <Card size="small">
            <Typography.Text type="secondary">变量成本/店/月</Typography.Text>
            <div>
              <Typography.Title level={4} style={{ margin: "4px 0" }}>
                {USD(totals.variableCostPerUser)}
              </Typography.Title>
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Typography.Text type="secondary">计费 Token/店/月</Typography.Text>
            <div>
              <Typography.Title level={4} style={{ margin: "4px 0" }}>
                {NUM(totals.billedTokensPerUser)}
              </Typography.Title>
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Typography.Text type="secondary">$/计费 Token</Typography.Text>
            <div>
              <Typography.Title level={4} style={{ margin: "4px 0" }}>
                {USD(totals.effectiveCostPerBilledToken, 6)}
              </Typography.Title>
            </div>
          </Card>
        </Col>
      </Row>
    </Space>
  );

  const plansTab = (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Alert
        type="info"
        showIcon
        message="PlanCatalog 对照"
        description="读取 Turso 当前启用套餐，按工作台成本模型估算隐含毛利率与建议 Token 发放量（不含年付周期折算）。"
      />
      {plans.length === 0 ? (
        <Alert type="warning" message="未读取到 PlanCatalog，请确认 Turso 已迁移种子数据" />
      ) : (
        <Table
          size="small"
          rowKey="planKey"
          pagination={false}
          scroll={{ x: 1100 }}
          dataSource={planMargins}
          columns={[
            {
              title: "套餐",
              dataIndex: "displayName",
              render: (v: string, r) => (
                <Space direction="vertical" size={0}>
                  <Typography.Text strong>{v}</Typography.Text>
                  <Typography.Text code style={{ fontSize: 10 }}>
                    {r.planKey}
                  </Typography.Text>
                </Space>
              ),
            },
            {
              title: "类型",
              render: (_: unknown, r) => (
                <Space>
                  <Tag color={r.kind === "SUBSCRIPTION" ? "green" : "orange"}>
                    {r.kind === "SUBSCRIPTION" ? "订阅" : "按量包"}
                  </Tag>
                  {r.billingInterval && <Tag>{r.billingInterval}</Tag>}
                </Space>
              ),
            },
            {
              title: "标价",
              dataIndex: "priceUsd",
              render: (v: number) => USD(v),
            },
            {
              title: "净收入",
              dataIndex: "netRevenueUsd",
              render: (v: number) => USD(v),
            },
            {
              title: "当前 Token",
              dataIndex: "tokens",
              render: (v: number) => NUM(v),
            },
            {
              title: "Token/$",
              dataIndex: "tokensPerDollar",
              render: (v: number) => NUM(v),
            },
            {
              title: "隐含毛利率",
              dataIndex: "impliedMarginPct",
              render: (v: number) => (
                <Badge
                  color={marginColor(v, targetGrossMarginPct)}
                  text={`${v.toFixed(1)}%`}
                />
              ),
            },
            {
              title: "建议 Token",
              dataIndex: "suggestedTokens",
              render: (v: number) => NUM(v),
            },
            {
              title: "偏差",
              dataIndex: "tokenDeltaPct",
              render: (v: number) => (
                <Tag color={v >= 0 ? "green" : "red"}>
                  {v >= 0 ? "+" : ""}
                  {v.toFixed(0)}%
                </Tag>
              ),
            },
          ]}
        />
      )}
    </Space>
  );

  const rulesTab = (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Alert
        type="info"
        showIcon
        message="计费规则建议"
        description="对比 Turso TokenBillingRule 与工作台建议值。Owner 可一键写回 multiplier / baseTokenCost（不影响线上 PlanCatalog）。"
      />
      <Button icon={<ReloadOutlined />} onClick={loadRules} loading={rulesLoading}>
        刷新规则
      </Button>
      <Table
        size="small"
        rowKey="ruleKey"
        loading={rulesLoading}
        pagination={{ pageSize: 15 }}
        scroll={{ x: 1200 }}
        dataSource={billingRules}
        columns={[
          { title: "规则", dataIndex: "ruleKey", render: (v: string) => <Typography.Text code style={{ fontSize: 11 }}>{v}</Typography.Text> },
          { title: "名称", dataIndex: "displayName" },
          { title: "倍率", dataIndex: "multiplier", render: (v: number) => `${v}x` },
          {
            title: "base",
            dataIndex: "baseTokenCost",
            render: (v: number | null) => (v != null ? NUM(v) : "-"),
          },
          {
            title: "建议倍率",
            render: (_: unknown, r: BillingRuleRow) => {
              const calc =
                featureRows.find(
                  (x) => x.feature === r.feature && x.modelKey === r.modelKey,
                ) ?? featureRows.find((x) => x.feature === r.feature);
              return calc ? (
                <Tag color={Math.abs(calc.suggestedMultiplier - r.multiplier) > 0.15 ? "orange" : "default"}>
                  {calc.suggestedMultiplier}x
                </Tag>
              ) : (
                "-"
              );
            },
          },
          {
            title: "建议 base",
            render: (_: unknown, r: BillingRuleRow) => {
              const calc =
                featureRows.find(
                  (x) => x.feature === r.feature && x.modelKey === r.modelKey,
                ) ?? featureRows.find((x) => x.feature === r.feature);
              return calc && calc.suggestedBaseTokenCost > 0
                ? NUM(calc.suggestedBaseTokenCost)
                : "-";
            },
          },
          ...(owner
            ? [
                {
                  title: "操作",
                  render: (_: unknown, r: BillingRuleRow) => {
                    const calc =
                      featureRows.find(
                        (x) => x.feature === r.feature && x.modelKey === r.modelKey,
                      ) ?? featureRows.find((x) => x.feature === r.feature);
                    return (
                      <Button
                        type="link"
                        size="small"
                        icon={<CloudSyncOutlined />}
                        disabled={!calc}
                        onClick={() => applyRuleSuggestion(r, calc)}
                      >
                        应用建议
                      </Button>
                    );
                  },
                },
              ]
            : []),
        ]}
      />
    </Space>
  );

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            定价工作台 v2
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ margin: 0, maxWidth: 720 }}>
            独立 v2 页面：模型/API 成本、基础设施固定成本与 Shopify 分成 → 套餐 Token 面值与计费倍率。
            配置与「定价工作台」分离存储；月固定成本两项共用。
          </Typography.Paragraph>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>
            重新加载
          </Button>
          {owner && (
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={handleSave}
            >
              保存配置
            </Button>
          )}
          <Link to="/pricing-studio" style={{ fontSize: 13 }}>
            原版定价工作台
          </Link>
        </Space>
      </div>

      {error && <Alert type="error" message={error} closable />}
      {!owner && (
        <Alert type="warning" showIcon message="只读模式 — 保存与写回规则需 Owner 账号" />
      )}

      <Tabs
        defaultActiveKey="overview"
        items={[
          {
            key: "overview",
            label: (
              <span>
                概览与反推{" "}
                <Tooltip title="KPI + 双向反推">
                  <InfoCircleOutlined />
                </Tooltip>
              </span>
            ),
            children: overviewTab,
          },
          { key: "features", label: "能力模型", children: featureTab },
          { key: "plans", label: "套餐对照", children: plansTab },
          { key: "rules", label: "规则建议", children: rulesTab },
        ]}
      />

      <Modal
        title="添加月固定成本"
        open={fixedModalOpen}
        onOk={handleAddFixedCost}
        onCancel={() => setFixedModalOpen(false)}
        okText="添加"
        cancelText="取消"
      >
        <Space direction="vertical" style={{ width: "100%", marginTop: 16 }}>
          <div>
            <Typography.Text>项目名称</Typography.Text>
            <Input
              style={{ marginTop: 4 }}
              placeholder="如 Render Web、Turso、Cosmos"
              value={newFixedName}
              onChange={(e) => setNewFixedName(e.target.value)}
            />
          </div>
          <div>
            <Typography.Text>月金额 (USD)</Typography.Text>
            <InputNumber
              style={{ width: "100%", marginTop: 4 }}
              min={0}
              value={newFixedAmount}
              onChange={(n) => setNewFixedAmount(Number(n ?? 0))}
            />
          </div>
        </Space>
      </Modal>
    </Space>
  );
}
