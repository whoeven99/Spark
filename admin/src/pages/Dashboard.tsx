import { useEffect, useState } from "react";
import {
  Row,
  Col,
  Card,
  Statistic,
  Table,
  Tag,
  Typography,
  Spin,
  Alert,
} from "antd";
import {
  ShopOutlined,
  CrownOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { fetchOverview, type OverviewData } from "../api";

const EVENT_COLORS: Record<string, string> = {
  APP_INSTALLED: "green",
  APP_UNINSTALLED: "red",
  SCOPES_UPDATE: "blue",
};

export default function Dashboard() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOverview()
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spin size="large" style={{ display: "block", margin: "80px auto" }} />;
  if (error) return <Alert type="error" message={error} />;
  if (!data) return null;

  const eventColumns = [
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
    {
      title: "事件",
      dataIndex: "eventType",
      key: "eventType",
      render: (v: string) => (
        <Tag color={EVENT_COLORS[v] ?? "default"}>{v}</Tag>
      ),
    },
    {
      title: "App",
      dataIndex: "appName",
      key: "appName",
      render: (v: string) => <Tag>{v}</Tag>,
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
      <Typography.Title level={4} style={{ marginBottom: 24 }}>
        概览
      </Typography.Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="商店总数"
              value={data.totalShops}
              prefix={<ShopOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="活跃订阅"
              value={data.activeSubs}
              prefix={<CrownOutlined />}
              valueStyle={{ color: "#52c41a" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="累计已用 Tokens"
              value={data.totalUsedTokens.toLocaleString()}
              prefix={<ThunderboltOutlined />}
              valueStyle={{ color: "#1677ff" }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card>
            <Statistic
              title="订阅 Tokens 总量"
              value={data.totalSubTokens.toLocaleString()}
            />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card>
            <Statistic
              title="购买 Tokens 总量"
              value={data.totalPurchasedTokens.toLocaleString()}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="最近事件"
        style={{ marginTop: 24 }}
        extra={
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            最近 30 条
          </Typography.Text>
        }
      >
        <Table
          dataSource={data.recentEvents}
          columns={eventColumns}
          rowKey={(r, i) => `${r.shop}-${r.createdAt}-${i}`}
          size="small"
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
}
