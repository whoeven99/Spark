import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Flex,
  message,
  Modal,
  Progress,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  AimOutlined,
  ArrowLeftOutlined,
  BarChartOutlined,
  BookOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DatabaseOutlined,
  GlobalOutlined,
  ReloadOutlined,
  RobotOutlined,
  ShopOutlined,
  SyncOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  fetchTsfShopProfileDetail,
  isOwner,
  triggerTsfShopProfileScan,
  type TsfShopProfileDetailData,
  type TsfShopScanStageState,
} from "../../api";

const { Text, Paragraph, Title } = Typography;

const STATUS_LABEL = {
  CREATED: "已创建",
  QUEUED: "排队中",
  SCANNING: "扫描中",
  COMPLETED: "已完成",
  PARTIAL: "部分完成",
  FAILED: "失败",
} as const;

const STATUS_COLOR: Record<keyof typeof STATUS_LABEL, string> = {
  CREATED: "default",
  QUEUED: "processing",
  SCANNING: "processing",
  COMPLETED: "success",
  PARTIAL: "warning",
  FAILED: "error",
};

const STAGE_LABEL = {
  contentSize: "内容规模",
  profile: "店铺画像",
  coverage: "语言覆盖率",
  glossary: "AI 术语建议",
} as const;

const STAGE_STATE_LABEL: Record<TsfShopScanStageState, string> = {
  PENDING: "待处理",
  DONE: "完成",
  SKIPPED: "跳过",
  FAILED: "失败",
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN");
}

function formatNumber(value: number | null | undefined): string {
  return typeof value === "number" ? value.toLocaleString() : "-";
}

function Tags({ values, color }: { values: string[]; color?: string }) {
  if (!values.length) return <Text type="secondary">-</Text>;
  return (
    <Flex gap={4} wrap="wrap">
      {values.map((value) => <Tag key={value} color={color}>{value}</Tag>)}
    </Flex>
  );
}

export default function TsfShopProfileDetail() {
  const { shop: encodedShop = "" } = useParams();
  const shop = decodeURIComponent(encodedShop);
  const navigate = useNavigate();
  const owner = isOwner();
  const [messageApi, messageContext] = message.useMessage();
  const [data, setData] = useState<TsfShopProfileDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanLoading, setScanLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback((quiet = false) => {
    if (!shop) return;
    if (!quiet) setLoading(true);
    setError("");
    fetchTsfShopProfileDetail(shop)
      .then(setData)
      .catch((err) => setError(String(err)))
      .finally(() => { if (!quiet) setLoading(false); });
  }, [shop]);

  useEffect(() => {
    load();
  }, [load]);

  const isActive = data?.scan
    ? ["CREATED", "QUEUED", "SCANNING"].includes(data.scan.status)
    : false;

  useEffect(() => {
    if (!isActive) return;
    const timer = window.setInterval(() => load(true), 5_000);
    return () => window.clearInterval(timer);
  }, [isActive, load]);

  function confirmScan() {
    Modal.confirm({
      title: `触发 ${shop} 的店铺画像扫描？`,
      content: "系统会读取 Shopify 内容并调用画像 AI；已有进行中扫描时不会重复创建。",
      okText: "确认触发",
      cancelText: "取消",
      onOk: async () => {
        setScanLoading(true);
        try {
          const result = await triggerTsfShopProfileScan(shop);
          messageApi.success(`扫描已入队：${result.scanId}`);
          await load(true);
        } catch (err) {
          messageApi.error(String(err));
          throw err;
        } finally {
          setScanLoading(false);
        }
      },
    });
  }

  const moduleRows = useMemo(() => Object.entries(data?.scan?.summary.moduleStats ?? {})
    .map(([module, value]) => ({ key: module, module, ...value }))
    .filter((row) => row.items > 0)
    .sort((a, b) => b.items - a.items), [data?.scan]);
  const coverageRows = useMemo(() => (data?.scan?.summary.coverage ?? [])
    .map((row) => ({ key: row.locale, ...row })), [data?.scan]);
  const completedStages = data?.scan
    ? Object.values(data.scan.stages).filter((state) => state === "DONE" || state === "SKIPPED").length
    : 0;

  if (loading) return <Flex justify="center" style={{ padding: 80 }}><Spin size="large" /></Flex>;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      {messageContext}
      <Flex justify="space-between" align="center" gap={16} wrap="wrap" style={{ marginBottom: 18 }}>
        <Flex align="center" gap={12}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/tsf/shop-profiles")}>返回列表</Button>
          <div>
            <Title level={4} style={{ margin: 0 }}>店铺画像 · {shop}</Title>
            <Text type="secondary">TSF Shop Profile、扫描状态与完整扫描产物</Text>
          </div>
          {data?.scan ? <Tag color={STATUS_COLOR[data.scan.status]}>{STATUS_LABEL[data.scan.status]}</Tag> : null}
          {data ? <Tag color={data.source === "none" ? "default" : "cyan"}>产物来源：{data.source}</Tag> : null}
        </Flex>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => load()}>刷新</Button>
          {owner ? (
            <Button
              type="primary"
              icon={isActive ? <SyncOutlined spin /> : <ThunderboltOutlined />}
              loading={scanLoading}
              disabled={isActive}
              onClick={confirmScan}
            >
              {isActive ? "扫描进行中" : data?.profile.hasProfile ? "重新扫描" : "生成画像"}
            </Button>
          ) : null}
        </Space>
      </Flex>

      {error ? <Alert type="error" message={error} style={{ marginBottom: 16 }} /> : null}
      {data?.scanNote ? <Alert type="warning" showIcon message="扫描数据读取提示" description={data.scanNote} style={{ marginBottom: 16 }} /> : null}

      {!data ? <Empty description="未找到画像数据" /> : (
        <Flex vertical gap={18}>
          <Card title={<Space><SyncOutlined spin={isActive} />扫描状态</Space>}>
            {data.scan ? (
              <Flex vertical gap={18}>
                <Row gutter={[16, 16]}>
                  <Col xs={12} lg={6}><Statistic title="最近更新" value={formatDate(data.scan.updatedAt)} valueStyle={{ fontSize: 16 }} /></Col>
                  <Col xs={12} lg={6}><Statistic title="完成阶段" value={completedStages} suffix="/ 4" /></Col>
                  <Col xs={12} lg={6}><Statistic title="内容模块" value={moduleRows.length} /></Col>
                  <Col xs={12} lg={6}><Statistic title="目标语言" value={coverageRows.length} /></Col>
                </Row>
                <Row gutter={[12, 12]}>
                  {(Object.keys(STAGE_LABEL) as Array<keyof typeof STAGE_LABEL>).map((stage, index) => {
                    const state = data.scan!.stages[stage];
                    const done = state === "DONE";
                    return (
                      <Col xs={12} md={6} key={stage}>
                        <Card size="small" styles={{ body: { padding: 12 } }}>
                          <Flex align="center" gap={10}>
                            {done
                              ? <CheckCircleOutlined style={{ color: "#008060", fontSize: 22 }} />
                              : state === "FAILED"
                                ? <CloseCircleOutlined style={{ color: "#d82c0d", fontSize: 22 }} />
                                : <Tag>{index + 1}</Tag>}
                            <div>
                              <Text strong>{STAGE_LABEL[stage]}</Text><br />
                              <Text type="secondary">{STAGE_STATE_LABEL[state]}</Text>
                            </div>
                          </Flex>
                        </Card>
                      </Col>
                    );
                  })}
                </Row>
                <Descriptions size="small" bordered column={{ xs: 1, md: 3 }}>
                  <Descriptions.Item label="扫描 ID" span={2}><Text copyable>{data.scan.id}</Text></Descriptions.Item>
                  <Descriptions.Item label="触发方式">{data.scan.trigger}</Descriptions.Item>
                  <Descriptions.Item label="创建时间">{formatDate(data.scan.createdAt)}</Descriptions.Item>
                  <Descriptions.Item label="领取时间">{formatDate(data.scan.claimedAt)}</Descriptions.Item>
                  <Descriptions.Item label="产物路径"><Text copyable>{data.scan.blobPrefix || "-"}</Text></Descriptions.Item>
                  <Descriptions.Item label="Worker">{data.scan.claimedBy || "-"}</Descriptions.Item>
                  <Descriptions.Item label="尝试次数">{data.scan.attempts}</Descriptions.Item>
                  <Descriptions.Item label="心跳">{formatDate(data.scan.lastHeartbeat)}</Descriptions.Item>
                  {data.scan.errorMessage ? <Descriptions.Item label="错误" span={3}><Text type="danger">{data.scan.errorStage}: {data.scan.errorMessage}</Text></Descriptions.Item> : null}
                </Descriptions>
              </Flex>
            ) : <Empty description="该商店暂无扫描任务" />}
          </Card>

          <Card title={<Space><DatabaseOutlined />店铺画像</Space>}>
            {data.profile.hasProfile ? (
              <Descriptions column={{ xs: 1, md: 2, lg: 3 }} size="small" bordered>
                <Descriptions.Item label="商店域名" span={2}><Text copyable>{data.profile.shop}</Text></Descriptions.Item>
                <Descriptions.Item label="安装状态"><Tag color={data.profile.installed ? "success" : "default"}>{data.profile.installed ? "在线" : "离线"}</Tag></Descriptions.Item>
                <Descriptions.Item label="店铺名称">{data.profile.shopName || "-"}</Descriptions.Item>
                <Descriptions.Item label="默认语言"><Tag>{data.profile.primaryLocale || "-"}</Tag></Descriptions.Item>
                <Descriptions.Item label="行业 / 品类"><Tag color="blue">{data.profile.industry || "-"}</Tag></Descriptions.Item>
                <Descriptions.Item label="品牌语气">{data.profile.brandTone || "-"}</Descriptions.Item>
                <Descriptions.Item label="AI 模型" span={2}>{data.profile.aiModel || "-"}</Descriptions.Item>
                <Descriptions.Item label="关键词" span={3}><Tags values={data.profile.keywords} color="purple" /></Descriptions.Item>
                <Descriptions.Item label="店铺描述" span={3}><Paragraph copyable style={{ margin: 0 }}>{data.profile.description || "-"}</Paragraph></Descriptions.Item>
                <Descriptions.Item label="画像创建">{formatDate(data.profile.createdAt)}</Descriptions.Item>
                <Descriptions.Item label="画像更新">{formatDate(data.profile.updatedAt)}</Descriptions.Item>
                <Descriptions.Item label="最近扫描">{formatDate(data.profile.lastScannedAt)}</Descriptions.Item>
                <Descriptions.Item label="画像扫描 ID" span={3}>{data.profile.lastScanId ? <Text copyable>{data.profile.lastScanId}</Text> : "-"}</Descriptions.Item>
              </Descriptions>
            ) : <Empty description="画像尚未生成" />}
          </Card>

          <Card title={<Space><RobotOutlined />店铺理解详情（AI 第一步）</Space>}>
            {data.understanding ? (
              <Descriptions column={{ xs: 1, md: 2, lg: 3 }} size="small" bordered>
                <Descriptions.Item label="行业">{data.understanding.industry || "-"}</Descriptions.Item>
                <Descriptions.Item label="子品类">{data.understanding.subIndustry || "-"}</Descriptions.Item>
                <Descriptions.Item label="价格区间">{data.understanding.priceRange || "-"}</Descriptions.Item>
                <Descriptions.Item label="品牌定位" span={3}>{data.understanding.brandPositioning || "-"}</Descriptions.Item>
                <Descriptions.Item label="品牌语气">{data.understanding.voiceStyle || "-"}</Descriptions.Item>
                <Descriptions.Item label="SEO 导向" span={2}>{data.understanding.seoDirection || "-"}</Descriptions.Item>
                <Descriptions.Item label="AI 描述" span={3}><Paragraph style={{ margin: 0 }}>{data.understanding.description || "-"}</Paragraph></Descriptions.Item>
                <Descriptions.Item label="AI 关键词" span={3}><Tags values={data.understanding.keywords} color="purple" /></Descriptions.Item>
                <Descriptions.Item label="核心商品类型" span={3}><Tags values={data.understanding.coreProductTypes} color="blue" /></Descriptions.Item>
                <Descriptions.Item label="卖点" span={3}>{data.understanding.sellingPoints.length ? data.understanding.sellingPoints.map((item) => <div key={item}>· {item}</div>) : "-"}</Descriptions.Item>
                <Descriptions.Item label="市场本地化关注点" span={3}>{data.understanding.marketNotes.length ? data.understanding.marketNotes.map((item) => <div key={item}>· {item}</div>) : "-"}</Descriptions.Item>
              </Descriptions>
            ) : <Empty description="暂无完整理解详情（需完成扫描且 Blob 可读）" />}
          </Card>

          <Card title={<Space><ShopOutlined />市场配置（Markets）</Space>}>
            <Table
              size="small"
              rowKey={(row) => row.handle || row.name}
              pagination={false}
              dataSource={data.markets}
              columns={[
                { title: "市场", dataIndex: "name", key: "name" },
                { title: "Handle", dataIndex: "handle", key: "handle", render: (value: string) => value || "-" },
                { title: "货币", dataIndex: "baseCurrency", key: "baseCurrency", render: (value: string | null) => value ? <Tag>{value}</Tag> : "-" },
                { title: "语言", dataIndex: "locales", key: "locales", render: (values: string[]) => <Tags values={values} /> },
                { title: "状态", dataIndex: "status", key: "status", render: (value: string) => value || "-" },
              ]}
              locale={{ emptyText: "暂无市场数据（需完成扫描且 Blob 可读）" }}
            />
          </Card>

          <Card title={<Space><DatabaseOutlined />画像原始素材（Shopify Facts）</Space>}>
            {data.facts ? (
              <Descriptions column={{ xs: 1, md: 2, lg: 3 }} size="small" bordered>
                <Descriptions.Item label="Shopify 店铺名">{data.facts.shopName}</Descriptions.Item>
                <Descriptions.Item label="主域名">{data.facts.primaryDomain ? <Text copyable>{data.facts.primaryDomain}</Text> : "-"}</Descriptions.Item>
                <Descriptions.Item label="币种">{data.facts.currencyCode || "-"}</Descriptions.Item>
                <Descriptions.Item label="商品类型" span={3}><Tags values={data.facts.productTypes} color="blue" /></Descriptions.Item>
                <Descriptions.Item label="供应商 / 品牌" span={3}><Tags values={data.facts.vendors} /></Descriptions.Item>
                <Descriptions.Item label="商品标签" span={3}><Tags values={data.facts.tags} color="purple" /></Descriptions.Item>
                <Descriptions.Item label="近期商品标题" span={3}><Tags values={data.facts.topProductTitles} /></Descriptions.Item>
                <Descriptions.Item label="集合标题" span={3}><Tags values={data.facts.collectionTitles} color="green" /></Descriptions.Item>
                <Descriptions.Item label="集合描述" span={3}>{data.facts.collectionDescriptions.length ? data.facts.collectionDescriptions.map((item) => <Paragraph key={item} style={{ marginBottom: 6 }}>· {item}</Paragraph>) : "-"}</Descriptions.Item>
                <Descriptions.Item label="文章标题" span={3}><Tags values={data.facts.articleTitles} /></Descriptions.Item>
                <Descriptions.Item label="文章摘要" span={3}>{data.facts.articleSummaries.length ? data.facts.articleSummaries.map((item) => <Paragraph key={item} style={{ marginBottom: 6 }}>· {item}</Paragraph>) : "-"}</Descriptions.Item>
                <Descriptions.Item label="菜单文案" span={3}><Tags values={data.facts.menuTitles} color="gold" /></Descriptions.Item>
              </Descriptions>
            ) : <Empty description="暂无 Shopify 原始素材（需完成扫描且 Blob 可读）" />}
          </Card>

          <Card title={<Space><AimOutlined />Theme / Scene / Module 文案样本</Space>}>
            <Table
              size="small"
              rowKey={(row, index) => `${row.module}-${row.key}-${index}`}
              pagination={{ pageSize: 12, hideOnSinglePage: true }}
              dataSource={data.themeTexts}
              columns={[
                { title: "Module", dataIndex: "module", key: "module", width: 310, render: (value: string) => <Tag color="blue">{value}</Tag> },
                { title: "Key / Scene", dataIndex: "key", key: "key", width: 260, render: (value: string) => <Text code>{value}</Text> },
                { title: "权重", dataIndex: "weight", key: "weight", width: 70, align: "right" },
                { title: "源文样本", dataIndex: "text", key: "text" },
              ]}
              locale={{ emptyText: "暂无 Theme 文案样本（需完成扫描且 Blob 可读）" }}
              scroll={{ x: 900 }}
            />
          </Card>

          <Card title={<Space><BarChartOutlined />内容信号（加权词频 / 抽样）</Space>}>
            {data.signals ? (
              <Flex vertical gap={16}>
                <Row gutter={[16, 12]}>
                  <Col xs={24} md={8}><Text type="secondary">品牌 / 供应商</Text><div style={{ marginTop: 6 }}><Tags values={data.signals.brandTerms} /></div></Col>
                  <Col xs={24} md={8}><Text type="secondary">品类词</Text><div style={{ marginTop: 6 }}><Tags values={data.signals.categoryTerms} color="blue" /></div></Col>
                  <Col xs={24} md={8}><Text type="secondary">导航词</Text><div style={{ marginTop: 6 }}><Tags values={data.signals.menuTerms} color="green" /></div></Col>
                </Row>
                <Row gutter={[16, 16]}>
                  <Col xs={24} lg={12}>
                    <Table size="small" rowKey={(row) => `term-${row.term}`} pagination={{ pageSize: 8, hideOnSinglePage: true }} dataSource={data.signals.weightedTopTerms} columns={[
                      { title: "高权重关键词", dataIndex: "term", key: "term" },
                      { title: "得分", dataIndex: "score", key: "score", width: 80, render: (value: number) => value.toFixed(1) },
                      { title: "次数", dataIndex: "count", key: "count", width: 70 },
                      { title: "来源", dataIndex: "sources", key: "sources", render: (values: string[]) => values.join(", ") || "-" },
                    ]} />
                  </Col>
                  <Col xs={24} lg={12}>
                    <Table size="small" rowKey={(row) => `phrase-${row.term}`} pagination={{ pageSize: 8, hideOnSinglePage: true }} dataSource={data.signals.weightedTopPhrases} columns={[
                      { title: "高权重短语", dataIndex: "term", key: "term" },
                      { title: "得分", dataIndex: "score", key: "score", width: 80, render: (value: number) => value.toFixed(1) },
                      { title: "次数", dataIndex: "count", key: "count", width: 70 },
                    ]} />
                  </Col>
                </Row>
                <div><Text type="secondary">来源样本数</Text><div style={{ marginTop: 6 }}><Tags values={Object.entries(data.signals.sourceStats).map(([source, count]) => `${source}: ${count}`)} /></div></div>
                <Table size="small" rowKey={(row, index) => `${row.source}-${index}`} pagination={{ pageSize: 8, hideOnSinglePage: true }} dataSource={data.signals.representativeSamples} columns={[
                  { title: "来源", dataIndex: "source", key: "source", width: 160 },
                  { title: "代表文案样本", dataIndex: "text", key: "text" },
                ]} />
              </Flex>
            ) : <Empty description="暂无信号数据（需完成扫描且 Blob 可读）" />}
          </Card>

          <Card title={<Space><RobotOutlined />翻译提示词预览</Space>}>
            {data.promptBlock ? (
              <Paragraph
                copyable={{ text: data.promptBlock }}
                style={{ margin: 0, padding: 14, background: "#f6f7f9", borderRadius: 8, whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}
              >{data.promptBlock}</Paragraph>
            ) : <Empty description="暂无可生成提示词的画像内容" />}
          </Card>

          <Card title={<Space><AimOutlined />术语与翻译策略（AI 第二步）</Space>}>
            {data.strategy ? (
              <Flex vertical gap={16}>
                <Row gutter={[16, 12]}>
                  <Col xs={24} md={8}><Text type="secondary">品牌词</Text><div style={{ marginTop: 6 }}><Tags values={data.strategy.brandTerms} color="blue" /></div></Col>
                  <Col xs={24} md={8}><Text type="secondary">不翻译词</Text><div style={{ marginTop: 6 }}><Tags values={data.strategy.doNotTranslateTerms} color="red" /></div></Col>
                  <Col xs={24} md={8}><Text type="secondary">SEO 关键词</Text><div style={{ marginTop: 6 }}><Tags values={data.strategy.seoTerms} color="purple" /></div></Col>
                </Row>
                <Table size="small" pagination={false} rowKey={(row) => row.source} dataSource={data.strategy.preferredTerms} columns={[
                  { title: "建议固定译法 / 源词", dataIndex: "source", key: "source" },
                  { title: "说明", dataIndex: "note", key: "note", render: (value: string | null) => value || "-" },
                ]} locale={{ emptyText: "暂无建议固定译法" }} />
                <Table size="small" pagination={false} rowKey="module" dataSource={data.strategy.moduleHints} columns={[
                  { title: "模块", dataIndex: "module", key: "module" },
                  { title: "语气", dataIndex: "tonePolicy", key: "tonePolicy", render: (value: string | null) => value || "-" },
                  { title: "关键词策略", dataIndex: "keywordPolicy", key: "keywordPolicy", render: (value: string | null) => value || "-" },
                  { title: "直译 / 意译", dataIndex: "literalVsAdaptive", key: "literalVsAdaptive", render: (value: string | null) => value || "-" },
                ]} locale={{ emptyText: "暂无模块级翻译建议" }} />
              </Flex>
            ) : <Empty description="暂无术语策略（需完成扫描且 AI 第二步成功）" />}
          </Card>

          <Row gutter={[18, 18]}>
            <Col xs={24} lg={12}>
              <Card title={<Space><ThunderboltOutlined />内容规模</Space>} style={{ height: "100%" }}>
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col span={12}><Statistic title="可翻译条目" value={formatNumber(data.scan?.summary.totalItems)} /></Col>
                  <Col span={12}><Statistic title="源文字符数" value={formatNumber(data.scan?.summary.totalChars)} /></Col>
                </Row>
                <Table size="small" pagination={false} dataSource={moduleRows} columns={[
                  { title: "模块", dataIndex: "module", key: "module" },
                  { title: "条目", dataIndex: "items", key: "items", align: "right", render: formatNumber },
                  { title: "字符", dataIndex: "chars", key: "chars", align: "right", render: formatNumber },
                ]} locale={{ emptyText: "暂无内容规模数据" }} />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title={<Space><GlobalOutlined />已发布语言覆盖率</Space>} style={{ height: "100%" }}>
                <Table size="small" pagination={false} dataSource={coverageRows} columns={[
                  { title: "语言", dataIndex: "locale", key: "locale", width: 90 },
                  { title: "进度", key: "count", width: 120, render: (_: unknown, row: (typeof coverageRows)[number]) => `${formatNumber(row.translated)} / ${formatNumber(row.total)}` },
                  { title: "覆盖率", dataIndex: "percent", key: "percent", render: (value: number | null) => value == null ? "-" : <Progress percent={value} size="small" /> },
                ]} locale={{ emptyText: "无已发布目标语言" }} />
              </Card>
            </Col>
          </Row>

          <Card title={<Space><BookOutlined />AI 术语建议</Space>}>
            <Flex vertical gap={12}>
              <Text>本次扫描归纳术语：<Text strong style={{ fontSize: 20 }}>{data.glossarySuggestions.length}</Text> 条</Text>
              <Table size="small" rowKey={(row, index) => `${row.locale}-${row.source}-${index}`} pagination={{ pageSize: 10, hideOnSinglePage: true }} dataSource={data.glossarySuggestions} columns={[
                { title: "语言", dataIndex: "locale", key: "locale", width: 90 },
                { title: "源词", dataIndex: "source", key: "source" },
                { title: "建议译文", dataIndex: "target", key: "target" },
              ]} locale={{ emptyText: "暂无术语建议" }} />
            </Flex>
          </Card>
        </Flex>
      )}
    </div>
  );
}
