import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Card,
  Col,
  Divider,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
  List,
} from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  FireOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { fetchOpsChecklist, type OpsChecklistData } from "../api";

const LEVEL_COLOR: Record<string, string> = {
  low: "green",
  medium: "orange",
  high: "red",
};

const CATEGORY_COLOR: Record<string, string> = {
  core: "blue",
  ai: "purple",
  ops: "cyan",
};

const FREQUENCY_COLOR: Record<string, string> = {
  daily: "red",
  weekly: "orange",
  monthly: "blue",
};

export default function OpsChecklist() {
  const [data, setData] = useState<OpsChecklistData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOpsChecklist()
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const stackRows = useMemo(() => {
    if (!data) return [];
    return [
      { area: "前端", items: data.technologyStack.frontend.join(" / ") },
      { area: "后端", items: data.technologyStack.backend.join(" / ") },
      { area: "数据基础设施", items: data.technologyStack.dataInfra.join(" / ") },
      { area: "AI", items: data.technologyStack.ai.join(" / ") },
      { area: "运维与通知", items: data.technologyStack.ops.join(" / ") },
    ];
  }, [data]);

  if (loading) {
    return <Spin size="large" style={{ display: "block", margin: "80px auto" }} />;
  }
  if (error) {
    return <Alert type="error" message={error} />;
  }
  if (!data) {
    return null;
  }

  return (
    <div>
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <div>
          <Typography.Title level={4} style={{ marginBottom: 4 }}>
            服务巡检总览
          </Typography.Title>
          <Typography.Text type="secondary">
            最后生成时间：{new Date(data.generatedAt).toLocaleString("zh-CN")}
          </Typography.Text>
        </div>

        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="高使用率商店 (>=80%)"
                value={data.metrics.highUsage80}
                prefix={<FireOutlined />}
                valueStyle={{ color: "#fa8c16" }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="高风险商店 (>=90%)"
                value={data.metrics.highUsage90}
                prefix={<WarningOutlined />}
                valueStyle={{ color: "#cf1322" }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="7 天内到期订阅"
                value={data.metrics.expiringIn7d}
                prefix={<ClockCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="翻译失败任务"
                value={data.metrics.translation.failed}
                prefix={<CheckCircleOutlined />}
                valueStyle={{ color: data.metrics.translation.failed > 0 ? "#cf1322" : "#389e0d" }}
              />
            </Card>
          </Col>
        </Row>

        <Card title="优先处理建议">
          <List
            dataSource={data.priorityActions}
            renderItem={(item) => (
              <List.Item>
                <Space direction="vertical" size={2} style={{ width: "100%" }}>
                  <Space>
                    <Tag color={LEVEL_COLOR[item.level] ?? "default"}>{item.level.toUpperCase()}</Tag>
                    <Typography.Text strong>{item.title}</Typography.Text>
                  </Space>
                  <Typography.Text type="secondary">{item.reason}</Typography.Text>
                  <Typography.Text>{item.suggestion}</Typography.Text>
                </Space>
              </List.Item>
            )}
          />
        </Card>

        <Card title="技术栈分层">
          <Table
            dataSource={stackRows}
            rowKey={(r) => r.area}
            size="small"
            pagination={false}
            columns={[
              { title: "层", dataIndex: "area", key: "area", width: 180 },
              { title: "技术", dataIndex: "items", key: "items" },
            ]}
          />
        </Card>

        <Card title="外部服务与成本观察点">
          <Table
            dataSource={data.services}
            rowKey={(r) => r.key}
            size="small"
            pagination={false}
            columns={[
              {
                title: "服务",
                dataIndex: "name",
                key: "name",
                render: (_v, r) => (
                  <Space>
                    <Typography.Text strong>{r.name}</Typography.Text>
                    <Tag color={CATEGORY_COLOR[r.category] ?? "default"}>{r.category}</Tag>
                    {r.required ? <Tag color="red">required</Tag> : <Tag>optional</Tag>}
                  </Space>
                ),
              },
              {
                title: "配置状态",
                key: "configured",
                dataIndex: "configured",
                width: 120,
                render: (v: boolean) =>
                  v ? <Tag color="green">已配置</Tag> : <Tag color="volcano">未配置</Tag>,
              },
              {
                title: "用途",
                dataIndex: "note",
                key: "note",
              },
              {
                title: "成本关注",
                dataIndex: "costSignal",
                key: "costSignal",
              },
              {
                title: "充值/扩容信号",
                dataIndex: "rechargeSignal",
                key: "rechargeSignal",
              },
            ]}
          />
        </Card>

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={14}>
            <Card title="Top Token 使用商店">
              <Table
                dataSource={data.topUsageShops}
                rowKey={(r) => `${r.shop}-${r.appName}`}
                size="small"
                pagination={false}
                columns={[
                  { title: "商店", dataIndex: "shop", key: "shop" },
                  { title: "App", dataIndex: "appName", key: "appName", width: 140 },
                  {
                    title: "使用率",
                    dataIndex: "usagePercent",
                    key: "usagePercent",
                    width: 130,
                    render: (v: number) => `${v}%`,
                  },
                  {
                    title: "已用 / 总量",
                    key: "used",
                    render: (_v, r) => `${r.usedTokens.toLocaleString()} / ${r.totalTokens.toLocaleString()}`,
                  },
                ]}
              />
            </Card>
          </Col>

          <Col xs={24} lg={10}>
            <Card title="近 7 天计费事件分布">
              <Table
                dataSource={data.billingEventTop7d}
                rowKey={(r) => r.eventType}
                size="small"
                pagination={false}
                columns={[
                  { title: "事件", dataIndex: "eventType", key: "eventType" },
                  { title: "次数", dataIndex: "total", key: "total", width: 90 },
                ]}
              />
              <Divider style={{ margin: "16px 0" }} />
              <Space direction="vertical" size={6}>
                <Typography.Text>翻译任务活动中：{data.metrics.translation.active}</Typography.Text>
                <Typography.Text>翻译任务暂停：{data.metrics.translation.paused}</Typography.Text>
                <Typography.Text>翻译任务 24h 完成：{data.metrics.translation.completed24h}</Typography.Text>
                {data.metrics.translation.note ? (
                  <Alert type="warning" showIcon message={data.metrics.translation.note} />
                ) : null}
              </Space>
            </Card>
          </Col>
        </Row>

        <Card title="定期巡检清单">
          <Row gutter={[16, 16]}>
            {data.checklist.map((group) => (
              <Col xs={24} lg={8} key={`${group.frequency}-${group.title}`}>
                <Card size="small" title={<Space><Tag color={FREQUENCY_COLOR[group.frequency] ?? "default"}>{group.frequency}</Tag>{group.title}</Space>}>
                  <List
                    size="small"
                    dataSource={group.checks}
                    renderItem={(check) => <List.Item>{check}</List.Item>}
                  />
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      </Space>
    </div>
  );
}
