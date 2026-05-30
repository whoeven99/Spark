import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Input,
  InputNumber,
  Row,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";

type UsageRow = {
  id: string;
  name: string;
  callsPerUserPerMonth: number;
  rawTokensPerCall: number;
  rawTokenPricePer1kUsd: number;
  multiplier: number;
  baseTokenCost: number;
  flatCostPerCallUsd: number;
};

type CalcRow = UsageRow & {
  monthlyCostPerUserUsd: number;
  billedTokensPerUser: number;
};

const USD = (v: number) =>
  Number.isFinite(v)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 4,
      }).format(v)
    : "-";

function positive(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

export default function PricingStudio() {
  const [monthlyFixedCostUsd, setMonthlyFixedCostUsd] = useState<number>(800);
  const [payingShops, setPayingShops] = useState<number>(100);
  const [targetGrossMarginPct, setTargetGrossMarginPct] = useState<number>(70);

  const [planPriceUsd, setPlanPriceUsd] = useState<number>(29.99);
  const [tokenGrantPerUser, setTokenGrantPerUser] = useState<number>(500000);

  const [rows, setRows] = useState<UsageRow[]>([
    {
      id: "copy",
      name: "商品文案",
      callsPerUserPerMonth: 180,
      rawTokensPerCall: 1400,
      rawTokenPricePer1kUsd: 0.002,
      multiplier: 1,
      baseTokenCost: 0,
      flatCostPerCallUsd: 0,
    },
    {
      id: "imagePrompt",
      name: "图片提示词",
      callsPerUserPerMonth: 60,
      rawTokensPerCall: 900,
      rawTokenPricePer1kUsd: 0.002,
      multiplier: 1,
      baseTokenCost: 0,
      flatCostPerCallUsd: 0,
    },
    {
      id: "imageGenerate",
      name: "文生图",
      callsPerUserPerMonth: 20,
      rawTokensPerCall: 1,
      rawTokenPricePer1kUsd: 0,
      multiplier: 1,
      baseTokenCost: 5000,
      flatCostPerCallUsd: 0.035,
    },
    {
      id: "pictureTranslate",
      name: "整图翻译",
      callsPerUserPerMonth: 30,
      rawTokensPerCall: 1,
      rawTokenPricePer1kUsd: 0,
      multiplier: 1,
      baseTokenCost: 2000,
      flatCostPerCallUsd: 0.01,
    },
  ]);

  const calcRows = useMemo<CalcRow[]>(() => {
    return rows.map((r) => {
      const calls = positive(r.callsPerUserPerMonth);
      const rawPerCall = positive(r.rawTokensPerCall);
      const pricePer1k = positive(r.rawTokenPricePer1kUsd);
      const multiplier = positive(r.multiplier);
      const base = positive(r.baseTokenCost);
      const flatCost = positive(r.flatCostPerCallUsd);

      const costPerCallUsd = (rawPerCall / 1000) * pricePer1k + flatCost;
      const billedPerCall = rawPerCall * multiplier + base;

      return {
        ...r,
        monthlyCostPerUserUsd: calls * costPerCallUsd,
        billedTokensPerUser: calls * billedPerCall,
      };
    });
  }, [rows]);

  const totals = useMemo(() => {
    const variableCostPerUser = calcRows.reduce(
      (s, r) => s + r.monthlyCostPerUserUsd,
      0,
    );
    const billedTokensPerUser = calcRows.reduce(
      (s, r) => s + r.billedTokensPerUser,
      0,
    );
    const effectiveCostPerBilledToken =
      billedTokensPerUser > 0 ? variableCostPerUser / billedTokensPerUser : 0;

    return {
      variableCostPerUser,
      billedTokensPerUser,
      effectiveCostPerBilledToken,
    };
  }, [calcRows]);

  const result = useMemo(() => {
    const n = positive(payingShops);
    const fixed = positive(monthlyFixedCostUsd);
    const margin = Math.min(99.9, Math.max(0, positive(targetGrossMarginPct))) / 100;
    const cpb = totals.effectiveCostPerBilledToken;

    const fixedPerUser = n > 0 ? fixed / n : 0;

    const suggestedPriceForGrant =
      margin < 1
        ? (fixedPerUser + positive(tokenGrantPerUser) * cpb) / (1 - margin)
        : Number.POSITIVE_INFINITY;

    const suggestedGrantForPrice =
      cpb > 0 && n > 0
        ? Math.max(0, (positive(planPriceUsd) * (1 - margin) - fixedPerUser) / cpb)
        : 0;

    const currentMarginByPrice =
      positive(planPriceUsd) > 0
        ? 1 - (fixedPerUser + positive(tokenGrantPerUser) * cpb) / positive(planPriceUsd)
        : 0;

    return {
      fixedPerUser,
      suggestedPriceForGrant,
      suggestedGrantForPrice,
      currentMarginByPrice,
    };
  }, [
    monthlyFixedCostUsd,
    payingShops,
    targetGrossMarginPct,
    planPriceUsd,
    tokenGrantPerUser,
    totals.effectiveCostPerBilledToken,
  ]);

  function updateRow(id: string, patch: Partial<UsageRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow() {
    const id = `row_${Date.now()}`;
    setRows((prev) => [
      ...prev,
      {
        id,
        name: "新能力",
        callsPerUserPerMonth: 10,
        rawTokensPerCall: 1000,
        rawTokenPricePer1kUsd: 0.002,
        multiplier: 1,
        baseTokenCost: 0,
        flatCostPerCallUsd: 0,
      },
    ]);
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  const columns = [
    {
      title: "能力",
      dataIndex: "name",
      render: (v: string, row: UsageRow) => (
        <Input
          value={v}
          onChange={(e) => updateRow(row.id, { name: e.target.value })}
        />
      ),
    },
    {
      title: "每店每月调用",
      dataIndex: "callsPerUserPerMonth",
      render: (v: number, row: UsageRow) => (
        <InputNumber
          min={0}
          value={v}
          onChange={(n) => updateRow(row.id, { callsPerUserPerMonth: Number(n ?? 0) })}
        />
      ),
    },
    {
      title: "每次原始 token",
      dataIndex: "rawTokensPerCall",
      render: (v: number, row: UsageRow) => (
        <InputNumber
          min={0}
          value={v}
          onChange={(n) => updateRow(row.id, { rawTokensPerCall: Number(n ?? 0) })}
        />
      ),
    },
    {
      title: "原始 token 成本(USD/1k)",
      dataIndex: "rawTokenPricePer1kUsd",
      render: (v: number, row: UsageRow) => (
        <InputNumber
          min={0}
          step={0.0001}
          precision={6}
          value={v}
          onChange={(n) => updateRow(row.id, { rawTokenPricePer1kUsd: Number(n ?? 0) })}
        />
      ),
    },
    {
      title: "倍率 multiplier",
      dataIndex: "multiplier",
      render: (v: number, row: UsageRow) => (
        <InputNumber
          min={0}
          step={0.1}
          precision={3}
          value={v}
          onChange={(n) => updateRow(row.id, { multiplier: Number(n ?? 0) })}
        />
      ),
    },
    {
      title: "固定扣 token(base)",
      dataIndex: "baseTokenCost",
      render: (v: number, row: UsageRow) => (
        <InputNumber
          min={0}
          value={v}
          onChange={(n) => updateRow(row.id, { baseTokenCost: Number(n ?? 0) })}
        />
      ),
    },
    {
      title: "每次固定美元成本",
      dataIndex: "flatCostPerCallUsd",
      render: (v: number, row: UsageRow) => (
        <InputNumber
          min={0}
          step={0.0001}
          precision={6}
          value={v}
          onChange={(n) => updateRow(row.id, { flatCostPerCallUsd: Number(n ?? 0) })}
        />
      ),
    },
    {
      title: "每店每月变量成本",
      render: (_: unknown, row: CalcRow) => <Tag>{USD(row.monthlyCostPerUserUsd)}</Tag>,
    },
    {
      title: "每店每月计费 token",
      render: (_: unknown, row: CalcRow) =>
        row.billedTokensPerUser.toLocaleString("en-US", { maximumFractionDigits: 0 }),
    },
    {
      title: "操作",
      render: (_: unknown, row: UsageRow) => (
        <Button danger size="small" onClick={() => removeRow(row.id)}>
          删除
        </Button>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Typography.Title level={3} style={{ marginBottom: 0 }}>
        定价工作台
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        目标是把「真实成本」映射为「套餐价格与发放 token」。你可以先输入成本结构，再做两个方向的反推：
        给定月费算应发 token，或给定 token 算建议月费。
      </Typography.Paragraph>

      <Alert
        type="info"
        showIcon
        message="核心逻辑"
        description={
          <div>
            1) 每个能力的每次成本 = 原始 token 成本 + 每次固定美元成本。
            <br />
            2) 每次计费 token = 原始 token × multiplier + baseTokenCost。
            <br />
            3) 综合得到每计费 token 成本，再结合固定成本与目标毛利，反推价格或 token 发放量。
          </div>
        }
      />

      <Card title="一、全局假设">
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Typography.Text>月固定成本(USD)</Typography.Text>
            <InputNumber
              style={{ width: "100%", marginTop: 6 }}
              min={0}
              value={monthlyFixedCostUsd}
              onChange={(n) => setMonthlyFixedCostUsd(Number(n ?? 0))}
            />
          </Col>
          <Col xs={24} md={8}>
            <Typography.Text>付费商店数</Typography.Text>
            <InputNumber
              style={{ width: "100%", marginTop: 6 }}
              min={1}
              value={payingShops}
              onChange={(n) => setPayingShops(Number(n ?? 1))}
            />
          </Col>
          <Col xs={24} md={8}>
            <Typography.Text>目标毛利率(%)</Typography.Text>
            <InputNumber
              style={{ width: "100%", marginTop: 6 }}
              min={0}
              max={99.9}
              step={0.1}
              value={targetGrossMarginPct}
              onChange={(n) => setTargetGrossMarginPct(Number(n ?? 0))}
            />
          </Col>
        </Row>
      </Card>

      <Card
        title="二、能力成本与计费 token 折算"
        extra={
          <Button type="primary" onClick={addRow}>
            新增能力
          </Button>
        }
      >
        <Table
          rowKey="id"
          dataSource={calcRows}
          columns={columns}
          pagination={false}
          scroll={{ x: 1700 }}
          size="small"
        />
        <Divider />
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Card size="small">
              <Typography.Text type="secondary">每店每月变量成本</Typography.Text>
              <Typography.Title level={4} style={{ margin: "8px 0 0" }}>
                {USD(totals.variableCostPerUser)}
              </Typography.Title>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small">
              <Typography.Text type="secondary">每店每月计费 token</Typography.Text>
              <Typography.Title level={4} style={{ margin: "8px 0 0" }}>
                {totals.billedTokensPerUser.toLocaleString("en-US", {
                  maximumFractionDigits: 0,
                })}
              </Typography.Title>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small">
              <Typography.Text type="secondary">每计费 token 成本</Typography.Text>
              <Typography.Title level={4} style={{ margin: "8px 0 0" }}>
                {USD(totals.effectiveCostPerBilledToken)}
              </Typography.Title>
            </Card>
          </Col>
        </Row>
      </Card>

      <Card title="三、反推结果">
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Typography.Title level={5}>A. 给定 token，算建议月费</Typography.Title>
            <Typography.Text>计划发放 token / 店 / 月</Typography.Text>
            <InputNumber
              style={{ width: "100%", marginTop: 6 }}
              min={0}
              value={tokenGrantPerUser}
              onChange={(n) => setTokenGrantPerUser(Number(n ?? 0))}
            />
            <Divider style={{ margin: "12px 0" }} />
            <Typography.Text type="secondary">固定成本分摊/店</Typography.Text>
            <Typography.Paragraph strong>{USD(result.fixedPerUser)}</Typography.Paragraph>
            <Typography.Text type="secondary">建议月费（满足目标毛利）</Typography.Text>
            <Typography.Paragraph strong style={{ fontSize: 20 }}>
              {USD(result.suggestedPriceForGrant)}
            </Typography.Paragraph>
          </Col>

          <Col xs={24} md={12}>
            <Typography.Title level={5}>B. 给定月费，算建议发放 token</Typography.Title>
            <Typography.Text>月费(USD / 店 / 月)</Typography.Text>
            <InputNumber
              style={{ width: "100%", marginTop: 6 }}
              min={0}
              value={planPriceUsd}
              onChange={(n) => setPlanPriceUsd(Number(n ?? 0))}
            />
            <Divider style={{ margin: "12px 0" }} />
            <Typography.Text type="secondary">建议发放 token（满足目标毛利）</Typography.Text>
            <Typography.Paragraph strong style={{ fontSize: 20 }}>
              {result.suggestedGrantForPrice.toLocaleString("en-US", {
                maximumFractionDigits: 0,
              })}
            </Typography.Paragraph>
            <Typography.Text type="secondary">当前“月费+token发放”的毛利率</Typography.Text>
            <Typography.Paragraph
              strong
              style={{
                color:
                  result.currentMarginByPrice >= targetGrossMarginPct / 100
                    ? "#389e0d"
                    : "#cf1322",
              }}
            >
              {(result.currentMarginByPrice * 100).toFixed(2)}%
            </Typography.Paragraph>
          </Col>
        </Row>
      </Card>
    </Space>
  );
}