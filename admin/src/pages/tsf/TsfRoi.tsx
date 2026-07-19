import { useEffect, useState } from "react";
import {
  Alert,
  Card,
  Col,
  Progress,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { Button } from "antd";
import {
  fetchTsfRoi,
  type TsfRoiActionList,
  type TsfRoiData,
  type TsfRoiFunnelStep,
  type TsfRoiMetric,
  type TsfRoiSource,
} from "../../api";

const SOURCE_COLOR: Record<TsfRoiSource, string> = {
  turso: "green",
  cosmos: "blue",
  sls: "orange",
  mock: "default",
};

const SOURCE_LABEL: Record<TsfRoiSource, string> = {
  turso: "Turso",
  cosmos: "Cosmos",
  sls: "SLS",
  mock: "Mock",
};

function SourceTag({ source, wired }: { source: TsfRoiSource; wired: boolean }) {
  return (
    <Tag color={wired ? SOURCE_COLOR[source] : "warning"} style={{ marginInlineEnd: 0 }}>
      {wired ? SOURCE_LABEL[source] : `未接入 · ${SOURCE_LABEL[source]}`}
    </Tag>
  );
}

function MetricTitle({ m }: { m: TsfRoiMetric }) {
  return (
    <Space size={4} wrap>
      <span>{m.label}</span>
      {!m.wired && (
        <Tooltip title={m.howto ?? "数据未接入"}>
          <ExclamationCircleOutlined style={{ color: "#fa8c16" }} />
        </Tooltip>
      )}
      {m.wired && (
        <Tooltip title={`已接入 · ${SOURCE_LABEL[m.source]}`}>
          <CheckCircleOutlined style={{ color: "#52c41a", fontSize: 12 }} />
        </Tooltip>
      )}
    </Space>
  );
}

function FunnelRow({ step, max }: { step: TsfRoiFunnelStep; max: number }) {
  const percent = max > 0 ? Math.min(100, Math.round((step.count / max) * 100)) : 0;
  const stroke =
    step.kind === "churn"
      ? "#ff4d4f"
      : step.kind === "branch"
        ? "#722ed1"
        : step.wired
          ? "#1677ff"
          : "#faad14";
  const kindTag =
    step.kind === "churn" ? (
      <Tag color="error">卸载</Tag>
    ) : step.kind === "branch" ? (
      <Tag color="purple">末级</Tag>
    ) : null;

  return (
    <div style={{ marginBottom: 14 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 4 }}>
        <Space size={6} wrap>
          <Typography.Text strong={step.kind === "forward"}>{step.label}</Typography.Text>
          {kindTag}
          <SourceTag source={step.source} wired={step.wired} />
          {!step.wired && step.howto && (
            <Tooltip title={step.howto}>
              <ExclamationCircleOutlined style={{ color: "#fa8c16" }} />
            </Tooltip>
          )}
        </Space>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {step.count.toLocaleString()} · {step.pctOfInstall}% of 安装
        </Typography.Text>
      </Row>
      <Progress
        percent={percent}
        showInfo={false}
        strokeColor={stroke}
        trailColor="#f5f5f5"
        size="small"
      />
      {step.note && (
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          {step.note}
        </Typography.Text>
      )}
    </div>
  );
}

function ActionListCard({ list }: { list: TsfRoiActionList }) {
  return (
    <Card
      size="small"
      title={
        <Space wrap>
          <span>{list.title}</span>
          <SourceTag source={list.source} wired={list.wired} />
          {!list.wired && (
            <Tooltip title={list.howto ?? "未接入"}>
              <ExclamationCircleOutlined style={{ color: "#fa8c16" }} />
            </Tooltip>
          )}
          <Tag>{list.rows.length}</Tag>
        </Space>
      }
    >
      {!list.wired && list.howto && (
        <Alert
          type="warning"
          showIcon
          icon={<ExclamationCircleOutlined />}
          message="数据未接入（下方为 Mock）"
          description={list.howto}
          style={{ marginBottom: 12 }}
        />
      )}
      <Table
        size="small"
        pagination={false}
        rowKey={(r) => `${r.shop}-${r.signal}`}
        dataSource={list.rows}
        locale={{ emptyText: "暂无数据" }}
        columns={[
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
          { title: "信号", dataIndex: "signal", key: "signal" },
          {
            title: "详情",
            dataIndex: "detail",
            key: "detail",
            render: (v: string) => (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {v}
              </Typography.Text>
            ),
          },
        ]}
      />
    </Card>
  );
}

export default function TsfRoi() {
  const [data, setData] = useState<TsfRoiData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    setError("");
    fetchTsfRoi()
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  if (loading && !data) {
    return <Spin size="large" style={{ display: "block", margin: "80px auto" }} />;
  }
  if (error && !data) return <Alert type="error" message={error} />;
  if (!data) return null;

  const installStep = data.funnel.find((s) => s.key === "install");
  const maxFunnel = installStep?.count || 1;
  const unwiredOverview = data.overview.filter((m) => !m.wired);

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 4 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          翻译 ROI
        </Typography.Title>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          刷新
        </Button>
      </Row>
      <Typography.Text
        type="secondary"
        style={{ display: "block", marginBottom: 16, fontSize: 12 }}
      >
        商业闭环看板 · 窗口 {data.windowDays} 天 · 生成于{" "}
        {new Date(data.generatedAt).toLocaleString("zh-CN")}
        。已接入项查 Turso/Cosmos；感叹号为未接入（Mock），见下方接入清单。
      </Typography.Text>

      {error && (
        <Alert type="warning" message={error} style={{ marginBottom: 12 }} closable />
      )}

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          <Space wrap>
            <Typography.Text strong>本周决策</Typography.Text>
            <SourceTag source={data.decision.source} wired={data.decision.wired} />
            {!data.decision.wired && (
              <Tooltip title={data.decision.howto ?? "未完全接入"}>
                <ExclamationCircleOutlined style={{ color: "#fa8c16" }} />
              </Tooltip>
            )}
            <Tag color="processing">{data.decision.title}</Tag>
          </Space>
          <Typography.Paragraph style={{ marginBottom: 0 }}>
            {data.decision.body}
          </Typography.Paragraph>
          {!data.decision.wired && data.decision.howto && (
            <Alert
              type="warning"
              showIcon
              message="决策依据尚未完全接入"
              description={data.decision.howto}
            />
          )}
        </Space>
      </Card>

      <Typography.Title level={5} style={{ marginTop: 0 }}>
        总览
      </Typography.Title>
      <Row gutter={[12, 12]} style={{ marginBottom: 8 }}>
        {data.overview.map((m) => (
          <Col xs={12} sm={8} md={6} key={m.key}>
            <Card size="small" styles={{ body: { padding: "12px 16px" } }}>
              <Statistic
                title={<MetricTitle m={m} />}
                value={m.display}
                valueStyle={{
                  fontSize: 20,
                  color: m.wired ? undefined : "#fa8c16",
                }}
              />
              <div style={{ marginTop: 4 }}>
                <SourceTag source={m.source} wired={m.wired} />
              </div>
            </Card>
          </Col>
        ))}
      </Row>
      {unwiredOverview.length > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={`${unwiredOverview.length} 项总览指标未接入`}
          description={
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {unwiredOverview.map((m) => (
                <li key={m.key}>
                  <Typography.Text strong>{m.label}</Typography.Text>
                  {m.howto ? ` — ${m.howto}` : null}
                </li>
              ))}
            </ul>
          }
        />
      )}

      <Typography.Title level={5}>
        主链路 · 总安装 → 试用/起步 → 留存 → 订阅 / 自动更新
      </Typography.Title>
      <Typography.Text
        type="secondary"
        style={{ display: "block", marginBottom: 8, fontSize: 12 }}
      >
        卸载 = 总安装 − 留存（红色条）。末级「订阅 / 自动更新」为并列分支，不是先后两步。
        {data.breakdown
          ? ` · Trial ${data.breakdown.trialShops} / Expand ${data.breakdown.expandShops} · 曾订阅 ${data.breakdown.everSubscribed}`
          : null}
      </Typography.Text>
      <Card size="small" style={{ marginBottom: 16 }}>
        {data.funnel.map((step) => (
          <FunnelRow key={step.key} step={step} max={maxFunnel} />
        ))}
      </Card>

      <Typography.Title level={5}>链路转化率（相对总安装或上一步）</Typography.Title>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {Object.entries(data.chainRates ?? {}).map(([key, r]) => (
          <Col xs={12} sm={8} md={6} key={key}>
            <Card size="small" styles={{ body: { padding: "12px 16px" } }}>
              <Statistic
                title={
                  <Space size={4}>
                    <span>{r.label}</span>
                    {!r.wired && (
                      <ExclamationCircleOutlined style={{ color: "#fa8c16" }} />
                    )}
                  </Space>
                }
                value={`${r.value}%`}
                valueStyle={{
                  fontSize: 20,
                  color: key.includes("Uninstalled")
                    ? "#ff4d4f"
                    : r.wired
                      ? undefined
                      : "#fa8c16",
                }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Typography.Title level={5}>SLS 关键事件（示意）</Typography.Title>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Alert
          type="warning"
          showIcon
          icon={<ExclamationCircleOutlined />}
          style={{ marginBottom: 12 }}
          message="数据未接入 · Mock"
          description={data.slsEvents[0]?.howto}
        />
        <Table
          size="small"
          pagination={false}
          rowKey="name"
          dataSource={data.slsEvents}
          columns={[
            { title: "事件", dataIndex: "name", key: "name" },
            {
              title: "count (mock)",
              dataIndex: "count",
              key: "count",
              align: "right",
              render: (v: number) => (
                <Typography.Text style={{ color: "#fa8c16" }}>
                  {v.toLocaleString()}
                </Typography.Text>
              ),
            },
            {
              title: "状态",
              key: "status",
              render: () => <SourceTag source="mock" wired={false} />,
            },
          ]}
        />
      </Card>

      <Typography.Title level={5}>C · 行动清单</Typography.Title>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <ActionListCard list={data.actionLists.stuckTrialExpand} />
        </Col>
        <Col xs={24} lg={12}>
          <ActionListCard list={data.actionLists.payingNoAuto} />
        </Col>
      </Row>

      <Typography.Title level={5}>
        <ExclamationCircleOutlined style={{ color: "#fa8c16", marginRight: 8 }} />
        待接入清单
      </Typography.Title>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Table
          size="small"
          pagination={false}
          rowKey="id"
          dataSource={data.howtoList}
          columns={[
            {
              title: "优先级",
              dataIndex: "priority",
              key: "priority",
              width: 80,
              render: (v: string) => (
                <Tag color={v === "P0" ? "red" : v === "P1" ? "orange" : "default"}>
                  {v}
                </Tag>
              ),
            },
            { title: "项", dataIndex: "title", key: "title", width: 160 },
            { title: "怎么接入", dataIndex: "detail", key: "detail" },
          ]}
        />
      </Card>

      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        {data.notes.join(" ")}
      </Typography.Paragraph>
    </div>
  );
}
