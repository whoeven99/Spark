import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Col,
  Flex,
  Input,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  fetchTsfShopProfiles,
  type TsfShopProfileRow,
  type TsfShopProfilesData,
} from "../../api";

type ProfileState = "all" | "with" | "without";

const EMPTY_DATA: TsfShopProfilesData = {
  stats: { totalShops: 0, profileShops: 0, missingProfileShops: 0, installedShops: 0 },
  profiles: [],
  total: 0,
  page: 1,
  pageSize: 20,
};

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN");
}

export default function TsfShopProfiles() {
  const navigate = useNavigate();
  const [data, setData] = useState<TsfShopProfilesData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [state, setState] = useState<ProfileState>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetchTsfShopProfiles({ search, profileState: state, page, pageSize })
      .then(setData)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [page, pageSize, search, state]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  function submitSearch() {
    const next = draftSearch.trim();
    setPage(1);
    if (next === search) setRefreshKey((key) => key + 1);
    else setSearch(next);
  }

  function openDetail(shop: string) {
    navigate(`/tsf/shop-profiles/${encodeURIComponent(shop)}`);
  }

  const coverage = useMemo(() => {
    if (!data.stats.totalShops) return 0;
    return Math.round((data.stats.profileShops / data.stats.totalShops) * 100);
  }, [data.stats]);

  const columns = [
    {
      title: "商店",
      dataIndex: "shop",
      key: "shop",
      width: 240,
      render: (shop: string) => (
        <Typography.Link onClick={() => openDetail(shop)}>{shop}</Typography.Link>
      ),
    },
    {
      title: "安装状态",
      dataIndex: "installed",
      key: "installed",
      width: 100,
      render: (installed: boolean) => installed ? <Tag color="green">在装</Tag> : <Tag>未安装</Tag>,
    },
    {
      title: "画像状态",
      dataIndex: "hasProfile",
      key: "hasProfile",
      width: 110,
      render: (hasProfile: boolean) => hasProfile
        ? <Tag icon={<CheckCircleOutlined />} color="success">有画像</Tag>
        : <Tag icon={<CloseCircleOutlined />}>无画像</Tag>,
    },
    { title: "店铺名称", dataIndex: "shopName", key: "shopName", width: 180, ellipsis: true, render: (value: string | null) => value || "-" },
    { title: "行业 / 品类", dataIndex: "industry", key: "industry", width: 180, ellipsis: true, render: (value: string | null) => value || "-" },
    { title: "默认语言", dataIndex: "primaryLocale", key: "primaryLocale", width: 100, render: (value: string | null) => value ? <Tag>{value}</Tag> : "-" },
    { title: "品牌语气", dataIndex: "brandTone", key: "brandTone", width: 180, ellipsis: true, render: (value: string | null) => value || "-" },
    {
      title: "关键词",
      dataIndex: "keywords",
      key: "keywords",
      width: 260,
      render: (keywords: string[]) => keywords.length ? (
        <Space size={[4, 4]} wrap>
          {keywords.slice(0, 3).map((keyword) => <Tag key={keyword}>{keyword}</Tag>)}
          {keywords.length > 3 ? <Tag>+{keywords.length - 3}</Tag> : null}
        </Space>
      ) : "-",
    },
    {
      title: "最近扫描",
      dataIndex: "lastScannedAt",
      key: "lastScannedAt",
      width: 180,
      render: (value: string | null) => <Typography.Text type="secondary">{formatDate(value)}</Typography.Text>,
    },
  ];

  return (
    <div>
      <Flex justify="space-between" align="center" gap={16} wrap="wrap" style={{ marginBottom: 16 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>翻译 用户画像</Typography.Title>
          <Typography.Text type="secondary">跨商店查看 TSF Shop Profile，点击商店进入完整扫描详情。</Typography.Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => setRefreshKey((key) => key + 1)}>刷新</Button>
      </Flex>

      <Alert
        type="info"
        showIcon
        message="数据口径"
        description="列表画像来自 TSF Turso；单店详情会继续读取 Cosmos 最新扫描任务与 Blob 扫描产物。"
        style={{ marginBottom: 16 }}
      />
      {error ? <Alert type="error" message={error} closable onClose={() => setError("")} style={{ marginBottom: 16 }} /> : null}

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} lg={6}><Card size="small"><Statistic title="已知商店" value={data.stats.totalShops} /></Card></Col>
        <Col xs={12} lg={6}><Card size="small"><Statistic title="有画像" value={data.stats.profileShops} valueStyle={{ color: "#008060" }} /></Card></Col>
        <Col xs={12} lg={6}><Card size="small"><Statistic title="无画像" value={data.stats.missingProfileShops} /></Card></Col>
        <Col xs={12} lg={6}><Card size="small"><Statistic title="画像覆盖率" value={coverage} suffix="%" /></Card></Col>
      </Row>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Flex gap={12} wrap="wrap" align="center">
          <Input
            prefix={<SearchOutlined />}
            placeholder="商店域名、店铺名称或行业"
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            onPressEnter={submitSearch}
            allowClear
            style={{ width: 320 }}
          />
          <Select<ProfileState>
            value={state}
            onChange={(value) => { setState(value); setPage(1); }}
            style={{ width: 150 }}
            options={[
              { value: "all", label: "全部画像状态" },
              { value: "with", label: "仅有画像" },
              { value: "without", label: "仅无画像" },
            ]}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={submitSearch}>查询</Button>
          <Typography.Text type="secondary">当前结果 {data.total} 家</Typography.Text>
        </Flex>
      </Card>

      <Spin spinning={loading}>
        <Table<TsfShopProfileRow>
          rowKey="shop"
          size="small"
          scroll={{ x: 1600 }}
          dataSource={data.profiles}
          columns={columns}
          onRow={(row) => ({ onDoubleClick: () => openDetail(row.shop) })}
          pagination={{
            current: page,
            pageSize,
            total: data.total,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 家商店`,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPageSize === pageSize ? nextPage : 1);
              setPageSize(nextPageSize);
            },
          }}
          locale={{ emptyText: "没有符合条件的商店" }}
        />
      </Spin>
    </div>
  );
}
