import { useEffect, useState, useCallback } from "react";
import {
  Table,
  Input,
  Tag,
  Typography,
  Spin,
  Alert,
  Space,
  DatePicker,
  Card,
  Statistic,
  Row,
  Col,
} from "antd";
import { SearchOutlined } from "@ant-design/icons";
import {
  fetchVisitSources,
  type VisitSourceRow,
  type VisitSourceByUtm,
} from "../api";

const UTM_COLORS: Record<string, string> = {
  email: "blue",
  meta: "geekblue",
  meta_ad: "geekblue",
  google: "green",
  google_ad: "green",
  tiktok: "magenta",
  shopify_app_store: "purple",
};

function utmColor(utm: string): string {
  return UTM_COLORS[utm] ?? "default";
}

export default function VisitSource() {
  const [visits, setVisits] = useState<VisitSourceRow[]>([]);
  const [byUtm, setByUtm] = useState<VisitSourceByUtm[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [shop, setShop] = useState("");
  const [utm, setUtm] = useState("");
  const [range, setRange] = useState<[string, string] | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has("shop")) setShop(params.get("shop") || "");
    if (params.has("utm")) setUtm(params.get("utm") || "");
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    fetchVisitSources({
      shop: shop || undefined,
      utm: utm || undefined,
      startDate: range?.[0],
      endDate: range?.[1],
      page,
      pageSize,
    })
      .then((r) => {
        setVisits(r.visits);
        setByUtm(r.byUtm);
        setTotal(r.total);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [shop, utm, range, page]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    {
      title: "商店",
      dataIndex: "shop",
      key: "shop",
      render: (v: string) => (
        <Typography.Link
          onClick={() => {
            setShop(v);
            setPage(1);
          }}
          style={{ fontSize: 13 }}
        >
          {v}
        </Typography.Link>
      ),
    },
    {
      title: "渠道 (utm)",
      dataIndex: "utm",
      key: "utm",
      render: (v: string) => (
        <Tag
          color={utmColor(v)}
          style={{ cursor: "pointer" }}
          onClick={() => {
            setUtm(v);
            setPage(1);
          }}
        >
          {v}
        </Tag>
      ),
    },
    {
      title: "落地页",
      dataIndex: "path",
      key: "path",
      render: (v: string) => (
        <Typography.Text code style={{ fontSize: 12 }}>
          {v}
        </Typography.Text>
      ),
    },
    {
      title: "App",
      dataIndex: "appName",
      key: "appName",
      render: (v: string) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {v}
        </Typography.Text>
      ),
    },
    {
      title: "点击时间",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (v: string) => (
        <Typography.Text style={{ fontSize: 12 }}>
          {new Date(v).toLocaleString("zh-CN")}
        </Typography.Text>
      ),
    },
  ];

  if (error) return <Alert type="error" message={error} />;

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>
        访问来源 / 渠道归因
      </Typography.Title>

      {/* 按渠道汇总 */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col>
          <Card size="small">
            <Statistic title="总入口次数（当前筛选）" value={total} />
          </Card>
        </Col>
        {byUtm.map((r) => (
          <Col key={r.utm}>
            <Card
              size="small"
              hoverable
              onClick={() => {
                setUtm(r.utm);
                setPage(1);
              }}
            >
              <Statistic
                title={
                  <Tag color={utmColor(r.utm)} style={{ marginInlineEnd: 0 }}>
                    {r.utm}
                  </Tag>
                }
                value={r.visits}
                suffix={
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    / {r.shopCount} 店
                  </Typography.Text>
                }
              />
            </Card>
          </Col>
        ))}
        {byUtm.length === 0 && !loading && (
          <Col>
            <Typography.Text type="secondary">暂无来源数据</Typography.Text>
          </Col>
        )}
      </Row>

      {/* 筛选 */}
      <Space wrap style={{ marginBottom: 16 }}>
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索商店域名"
          value={shop}
          onChange={(e) => setShop(e.target.value)}
          onPressEnter={() => setPage(1)}
          allowClear
          onClear={() => {
            setShop("");
            setPage(1);
          }}
          style={{ width: 240 }}
        />
        <Input
          placeholder="渠道 utm（如 email）"
          value={utm}
          onChange={(e) => setUtm(e.target.value)}
          onPressEnter={() => setPage(1)}
          allowClear
          onClear={() => {
            setUtm("");
            setPage(1);
          }}
          style={{ width: 200 }}
        />
        <DatePicker.RangePicker
          showTime
          onChange={(_, strs) => {
            setRange(strs[0] && strs[1] ? [strs[0], strs[1]] : null);
            setPage(1);
          }}
        />
      </Space>

      <Spin spinning={loading}>
        <Table
          dataSource={visits}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (t) => `共 ${t} 条`,
          }}
        />
      </Spin>
    </div>
  );
}
