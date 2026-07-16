import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Alert,
  AutoComplete,
  Badge,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Input,
  Modal,
  message,
  Row,
  Col,
  Spin,
  Table,
  Tag,
  Typography,
  Card,
  Statistic,
  Select,
  Progress,
  Timeline,
  Space,
} from "antd";
import { SearchOutlined, ReloadOutlined, HistoryOutlined, CalculatorOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import {
  fetchTranslations,
  fetchTranslationJob,
  fetchShopTranslationSummary,
  fetchShopSizeProfiles,
  fetchShopLangPairs,
  searchTranslationShops,
  fetchTsfShops,
  fetchTsfUsageAccount,
  fetchTsfUsageHistory,
  estimateRemainingTokens,
  AUTO_TASK_SOURCE,
  type TranslationJob,
  type ShopTranslationSummary,
  type ShopTranslationFilters,
  type ShopSizeProfile,
  type ShopLangPairRow,
  type TsfUsageRow,
  type TsfUsageHistoryRow,
  type EstimateRemainingTokensResult,
} from "../api";
import { TranslationContentViewer } from "../components/translation/TranslationContentViewer";

const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const RECENT_SHOPS_KEY = "spark_admin_recent_shops";
const MAX_RECENT_SHOPS = 12;
const PAGE_SIZE = 50;
const MAX_ESTIMATE_JOBS = 30;

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function loadRecentShops(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SHOPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function saveRecentShop(shop: string) {
  const trimmed = shop.trim();
  if (!trimmed) return;
  const prev = loadRecentShops().filter((s) => s !== trimmed);
  localStorage.setItem(RECENT_SHOPS_KEY, JSON.stringify([trimmed, ...prev].slice(0, MAX_RECENT_SHOPS)));
}

function statusLabel(status: string): string {
  const s = status.toUpperCase();
  if (s === "COMPLETED") return "已完成";
  if (s === "FAILED") return "已失败";
  if (s === "CANCELLED") return "已取消";
  if (s === "PAUSED") return "已暂停";
  if (s.includes("VERIF")) return "验证中";
  if (s.includes("WRIT")) return "写回中";
  if (s.includes("TRANSLAT")) return "翻译中";
  if (s.includes("INIT")) return "初始化";
  return status;
}

function statusColor(status: string): string {
  const s = status.toUpperCase();
  if (s === "COMPLETED") return "success";
  if (s === "FAILED") return "error";
  if (s === "PAUSED" || s === "CANCELLED") return "default";
  if (s.includes("VERIF")) return "purple";
  if (s.includes("WRIT")) return "warning";
  if (s.includes("TRANSLAT")) return "processing";
  return "default";
}

function filtersFromParams(sp: URLSearchParams): ShopTranslationFilters | null {
  const shop = sp.get("shop")?.trim();
  if (!shop) return null;
  return {
    shop,
    langFrom: sp.get("langFrom") ?? undefined,
    langTo: sp.get("langTo") ?? undefined,
    createdFrom: sp.get("createdFrom") ?? undefined,
    createdTo: sp.get("createdTo") ?? undefined,
  };
}

function dateRangeFromFilters(filters: ShopTranslationFilters): [Dayjs, Dayjs] | null {
  if (!filters.createdFrom && !filters.createdTo) return null;
  const start = filters.createdFrom ? dayjs(filters.createdFrom) : null;
  const end = filters.createdTo ? dayjs(filters.createdTo) : null;
  if (start?.isValid() && end?.isValid()) return [start, end];
  if (start?.isValid()) return [start, start];
  if (end?.isValid()) return [end, end];
  return null;
}

function langPairKey(langFrom?: string, langTo?: string): string | undefined {
  if (!langFrom || !langTo) return undefined;
  return `${langFrom}|${langTo}`;
}

function mergeShopSuggestions(
  recent: string[],
  cosmos: string[],
  tsf: string[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of [recent, cosmos, tsf]) {
    for (const shop of list) {
      const s = shop.trim();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

export default function ShopTranslation() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeFilters = useMemo(() => filtersFromParams(searchParams), [searchParams]);

  const [shopInput, setShopInput] = useState(activeFilters?.shop ?? "");
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(
    activeFilters ? dateRangeFromFilters(activeFilters) : null,
  );
  const [langPair, setLangPair] = useState<string | undefined>(
    activeFilters ? langPairKey(activeFilters.langFrom, activeFilters.langTo) : undefined,
  );

  const [summary, setSummary] = useState<ShopTranslationSummary | null>(null);
  const [jobs, setJobs] = useState<TranslationJob[]>([]);
  const [langPairs, setLangPairs] = useState<ShopLangPairRow[]>([]);
  const [sizeProfile, setSizeProfile] = useState<ShopSizeProfile | null>(null);
  const [tsfAccount, setTsfAccount] = useState<TsfUsageRow | null>(null);
  const [tsfNote, setTsfNote] = useState("");

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);

  const [shopOptions, setShopOptions] = useState<{ value: string; label: React.ReactNode }[]>([]);
  const [shopSearchLoading, setShopSearchLoading] = useState(false);
  const shopSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selected, setSelected] = useState<TranslationJob | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tsfHistoryOpen, setTsfHistoryOpen] = useState(false);
  const [tsfHistory, setTsfHistory] = useState<TsfUsageHistoryRow[]>([]);
  const [tsfHistoryLoading, setTsfHistoryLoading] = useState(false);

  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateResult, setEstimateResult] = useState<EstimateRemainingTokensResult | null>(null);

  const buildFiltersFromUi = useCallback((): ShopTranslationFilters | null => {
    const shop = shopInput.trim();
    if (!shop) return null;
    const filters: ShopTranslationFilters = { shop };
    if (langPair) {
      const [langFrom, langTo] = langPair.split("|");
      if (langFrom) filters.langFrom = langFrom;
      if (langTo) filters.langTo = langTo;
    }
    if (dateRange?.[0]?.isValid()) {
      filters.createdFrom = dateRange[0].startOf("day").toISOString();
    }
    if (dateRange?.[1]?.isValid()) {
      filters.createdTo = dateRange[1].endOf("day").toISOString();
    }
    return filters;
  }, [shopInput, langPair, dateRange]);

  const syncUrl = useCallback(
    (filters: ShopTranslationFilters) => {
      const params = new URLSearchParams();
      params.set("shop", filters.shop);
      if (filters.langFrom) params.set("langFrom", filters.langFrom);
      if (filters.langTo) params.set("langTo", filters.langTo);
      if (filters.createdFrom) params.set("createdFrom", filters.createdFrom);
      if (filters.createdTo) params.set("createdTo", filters.createdTo);
      setSearchParams(params, { replace: true });
    },
    [setSearchParams],
  );

  const loadData = useCallback(
    async (filters: ShopTranslationFilters, append = false, offset = 0) => {
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError("");
        setJobs([]);
        setSummary(null);
        setLangPairs([]);
        setSizeProfile(null);
        setTsfAccount(null);
        setTsfNote("");
        setSelectedJobIds([]);
        setEstimateResult(null);
      }

      const pairFilters: ShopTranslationFilters = {
        shop: filters.shop,
        createdFrom: filters.createdFrom,
        createdTo: filters.createdTo,
      };

      try {
        const [summaryRes, jobsRes, pairsRes, sizeRes, tsfRes] = await Promise.all([
          append ? Promise.resolve(null) : fetchShopTranslationSummary(filters),
          fetchTranslations({ ...filters, limit: PAGE_SIZE, offset }),
          append ? Promise.resolve(null) : fetchShopLangPairs(pairFilters),
          append ? Promise.resolve(null) : fetchShopSizeProfiles().catch(() => null),
          append ? Promise.resolve(null) : fetchTsfUsageAccount(filters.shop).catch((e) => ({
            account: null,
            note: String(e),
          })),
        ]);

        if (summaryRes) setSummary(summaryRes);
        setJobs((prev) => (append ? [...prev, ...jobsRes.jobs] : jobsRes.jobs));
        setHasMore(jobsRes.jobs.length >= PAGE_SIZE);
        if (pairsRes) setLangPairs(pairsRes.pairs);
        if (sizeRes?.profiles) {
          setSizeProfile(sizeRes.profiles.find((p) => p.shopName === filters.shop) ?? null);
        }
        if (tsfRes) {
          setTsfAccount(tsfRes.account);
          if (tsfRes.note) setTsfNote(tsfRes.note);
        }
        if (!append) saveRecentShop(filters.shop);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  const searchShops = useCallback((text: string) => {
    if (shopSearchTimer.current) clearTimeout(shopSearchTimer.current);
    shopSearchTimer.current = setTimeout(async () => {
      setShopSearchLoading(true);
      try {
        const q = text.trim();
        const recent = q ? [] : loadRecentShops();
        const [cosmosRes, tsfRes] = await Promise.all([
          searchTranslationShops(q || undefined).catch(() => ({ shops: [] as string[] })),
          fetchTsfShops(q || undefined).catch(() => ({ shops: [] as { shop: string }[] })),
        ]);
        const merged = mergeShopSuggestions(
          recent,
          cosmosRes.shops,
          tsfRes.shops.map((s) => s.shop),
        );
        setShopOptions(
          merged.slice(0, 30).map((shop) => ({
            value: shop,
            label: (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 13 }}>{shop}</span>
                {recent.includes(shop) && !q && (
                  <Badge count="最近" style={{ backgroundColor: "#1677ff" }} />
                )}
              </div>
            ),
          })),
        );
      } finally {
        setShopSearchLoading(false);
      }
    }, 250);
  }, []);

  useEffect(() => {
    searchShops("");
    return () => {
      if (shopSearchTimer.current) clearTimeout(shopSearchTimer.current);
    };
  }, [searchShops]);

  useEffect(() => {
    if (!activeFilters) return;
    setShopInput(activeFilters.shop);
    setDateRange(dateRangeFromFilters(activeFilters));
    setLangPair(langPairKey(activeFilters.langFrom, activeFilters.langTo));
    loadData(activeFilters);
  }, [activeFilters, loadData]);

  function onSearch() {
    const filters = buildFiltersFromUi();
    if (!filters) return;
    syncUrl(filters);
  }

  function clearFilters() {
    setDateRange(null);
    setLangPair(undefined);
    const shop = shopInput.trim();
    if (!shop) return;
    const params = new URLSearchParams();
    params.set("shop", shop);
    setSearchParams(params, { replace: true });
  }

  function openDetail(job: TranslationJob) {
    setSelected(job);
    setDetailLoading(true);
    fetchTranslationJob(job.id, job.shopName)
      .then((r) => setSelected(r.job))
      .finally(() => setDetailLoading(false));
  }

  function openTsfHistory() {
    if (!activeFilters?.shop) return;
    setTsfHistoryOpen(true);
    setTsfHistoryLoading(true);
    fetchTsfUsageHistory(activeFilters.shop)
      .then((r) => setTsfHistory(r.history))
      .catch((e) => setError(String(e)))
      .finally(() => setTsfHistoryLoading(false));
  }

  async function onEstimateRemaining() {
    const shop = activeFilters?.shop;
    if (!shop) return;
    if (selectedJobIds.length === 0) {
      message.warning("请先勾选要估算的任务");
      return;
    }
    if (selectedJobIds.length > MAX_ESTIMATE_JOBS) {
      message.warning(`一次最多估算 ${MAX_ESTIMATE_JOBS} 个任务`);
      return;
    }

    setEstimateLoading(true);
    try {
      const result = await estimateRemainingTokens({ shop, jobIds: selectedJobIds });
      setEstimateResult(result);
      if (result.missingJobIds.length > 0) {
        message.warning(`${result.missingJobIds.length} 个任务未找到，已跳过`);
      }
    } catch (e) {
      message.error(String(e));
    } finally {
      setEstimateLoading(false);
    }
  }

  const statusRows = useMemo(() => {
    if (!summary?.byStatus?.length) return [];
    return [...summary.byStatus].sort((a, b) => b.tokens - a.tokens);
  }, [summary]);

  const completedCount = useMemo(
    () => summary?.byStatus.find((r) => r.status === "COMPLETED")?.taskCount ?? 0,
    [summary],
  );
  const failedCount = useMemo(
    () => summary?.byStatus.find((r) => r.status === "FAILED")?.taskCount ?? 0,
    [summary],
  );

  const hasActiveFilters = Boolean(langPair || dateRange);

  const columns = [
    {
      title: "语言对",
      key: "lang",
      render: (_: unknown, r: TranslationJob) => (
        <span style={{ fontFamily: MONO, fontSize: 12 }}>
          {r.source} → {r.target}
        </span>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (v: string) => <Tag color={statusColor(v)}>{statusLabel(v)}</Tag>,
    },
    {
      title: "模块",
      dataIndex: "modules",
      key: "modules",
      render: (mods: string[]) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {mods.length} 个
        </Typography.Text>
      ),
    },
    {
      title: "Token 消耗",
      key: "tokens",
      sorter: (a: TranslationJob, b: TranslationJob) =>
        (a.metrics.usedTokens || 0) - (b.metrics.usedTokens || 0),
      render: (_: unknown, r: TranslationJob) => (
        <Typography.Text strong style={{ fontFamily: MONO }}>
          {fmtNum(r.metrics.usedTokens || 0)}
        </Typography.Text>
      ),
    },
    {
      title: "翻译失败",
      key: "failed",
      render: (_: unknown, r: TranslationJob) => (
        <Typography.Text type={r.metrics.translateFailed > 0 ? "danger" : "secondary"}>
          {r.metrics.translateFailed}
        </Typography.Text>
      ),
    },
    {
      title: "来源",
      key: "source",
      render: (_: unknown, r: TranslationJob) =>
        r.taskSource === AUTO_TASK_SOURCE ? <Tag color="blue">自动</Tag> : <Tag>手动</Tag>,
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      sorter: (a: TranslationJob, b: TranslationJob) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      defaultSortOrder: "descend" as const,
      render: (v: string) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {new Date(v).toLocaleString("zh-CN")}
        </Typography.Text>
      ),
    },
    {
      title: "操作",
      key: "action",
      render: (_: unknown, r: TranslationJob) => (
        <Button type="link" size="small" onClick={() => openDetail(r)}>
          详情 / 内容
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 8 }}>
        商店任务查询
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 20 }}>
        按商店查看翻译任务 Token 消耗、TSF 账户额度与翻译内容；支持时间范围与语言对筛选。
      </Typography.Paragraph>

      <Space direction="vertical" size={12} style={{ width: "100%", marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <AutoComplete
            style={{ minWidth: 320, flex: "1 1 320px", maxWidth: 480 }}
            value={shopInput}
            options={shopOptions}
            onSearch={searchShops}
            onChange={setShopInput}
            onSelect={setShopInput}
            notFoundContent={shopSearchLoading ? <Spin size="small" /> : "无匹配商店"}
          >
            <Input
              prefix={<SearchOutlined />}
              placeholder="商店域名（支持模糊搜索 / 最近查询）"
              onPressEnter={onSearch}
              allowClear
            />
          </AutoComplete>
          <Button type="primary" icon={<SearchOutlined />} onClick={onSearch}>
            查询
          </Button>
          {activeFilters && (
            <Button
              icon={<ReloadOutlined />}
              onClick={() => loadData(activeFilters)}
              loading={loading}
            >
              刷新
            </Button>
          )}
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <DatePicker.RangePicker
            value={dateRange}
            onChange={(vals) => setDateRange(vals as [Dayjs, Dayjs] | null)}
            placeholder={["创建开始", "创建结束"]}
            allowEmpty={[true, true]}
          />
          <Select
            allowClear
            placeholder="语言对筛选"
            style={{ minWidth: 200 }}
            value={langPair}
            onChange={setLangPair}
            disabled={!shopInput.trim()}
            options={langPairs.map((p) => ({
              value: `${p.source}|${p.target}`,
              label: `${p.source} → ${p.target}（${p.taskCount} 任务 · ${fmtNum(p.tokens)} Token）`,
            }))}
          />
          {hasActiveFilters && (
            <Button type="link" onClick={clearFilters}>
              清除筛选
            </Button>
          )}
        </div>
      </Space>

      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} showIcon />}
      {summary?.note && <Alert type="warning" message={summary.note} style={{ marginBottom: 16 }} showIcon />}

      {!activeFilters && !loading && (
        <Alert type="info" message="请输入或选择商店域名开始查询" showIcon />
      )}

      {activeFilters && (
        <Spin spinning={loading}>
          <div style={{ marginBottom: 20 }}>
            <Typography.Title level={5} style={{ marginBottom: 4 }}>
              {activeFilters.shop}
            </Typography.Title>
            {sizeProfile && (
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                商店体量：{sizeProfile.sizeTier}
                {sizeProfile.largestLanguage ? ` · 最大语言 ${sizeProfile.largestLanguage}` : ""}
              </Typography.Text>
            )}
            {hasActiveFilters && (
              <div style={{ marginTop: 6 }}>
                <Tag color="processing">已应用筛选</Tag>
                {activeFilters.langFrom && activeFilters.langTo && (
                  <Tag>
                    {activeFilters.langFrom} → {activeFilters.langTo}
                  </Tag>
                )}
                {activeFilters.createdFrom && (
                  <Tag>
                    自 {dayjs(activeFilters.createdFrom).format("YYYY-MM-DD")}
                  </Tag>
                )}
                {activeFilters.createdTo && (
                  <Tag>
                    至 {dayjs(activeFilters.createdTo).format("YYYY-MM-DD")}
                  </Tag>
                )}
              </div>
            )}
          </div>

          <Typography.Title level={5} style={{ marginBottom: 12 }}>
            TSF 账户额度
          </Typography.Title>
          {tsfNote && !tsfAccount && (
            <Alert type="warning" message={tsfNote} style={{ marginBottom: 12 }} showIcon />
          )}
          {tsfAccount ? (
            <Card size="small" style={{ marginBottom: 24 }}>
              <Row gutter={[16, 16]} align="middle">
                <Col xs={24} md={14}>
                  <div style={{ marginBottom: 8 }}>
                    <Space wrap>
                      {tsfAccount.planKey && <Tag color="blue">{tsfAccount.planKey}</Tag>}
                      {tsfAccount.subStatus && (
                        <Tag color={tsfAccount.subStatus === "ACTIVE" ? "success" : "default"}>
                          {tsfAccount.subStatus}
                        </Tag>
                      )}
                    </Space>
                  </div>
                  <Progress
                    percent={tsfAccount.usagePercent}
                    status={tsfAccount.usagePercent >= 90 ? "exception" : "active"}
                    format={() =>
                      `${tsfAccount.usedCredits.toLocaleString()} / ${tsfAccount.totalCredits.toLocaleString()} Credits`
                    }
                  />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    剩余 {tsfAccount.remainingCredits.toLocaleString()} Credits
                    {tsfAccount.currentPeriodEnd
                      ? ` · 周期至 ${new Date(tsfAccount.currentPeriodEnd).toLocaleDateString("zh-CN")}`
                      : ""}
                  </Typography.Text>
                </Col>
                <Col xs={12} md={3}>
                  <Statistic title="已用 Credits" value={tsfAccount.usedCredits} />
                </Col>
                <Col xs={12} md={3}>
                  <Statistic title="总量" value={tsfAccount.totalCredits} />
                </Col>
                <Col xs={24} md={4}>
                  <Button icon={<HistoryOutlined />} onClick={openTsfHistory}>
                    周期历史
                  </Button>
                </Col>
              </Row>
            </Card>
          ) : (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 24 }}
              message="该商店暂无 TSF 计费账户记录（可能未绑定 TSF 或仅存在翻译任务）"
            />
          )}

          <Typography.Title level={5} style={{ marginBottom: 12 }}>
            翻译任务消耗
          </Typography.Title>
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} sm={12} md={6}>
              <Card size="small">
                <Statistic title="任务数（筛选内）" value={summary?.taskCount ?? 0} />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card size="small">
                <Statistic
                  title="任务 Token 消耗"
                  value={summary?.totalTokens ?? 0}
                  formatter={(v) => Number(v).toLocaleString()}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card size="small">
                <Statistic title="已完成" value={completedCount} valueStyle={{ color: "#52c41a" }} />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card size="small">
                <Statistic
                  title="已失败"
                  value={failedCount}
                  valueStyle={{ color: failedCount > 0 ? "#ff4d4f" : undefined }}
                />
              </Card>
            </Col>
          </Row>

          {statusRows.length > 0 && (
            <Card size="small" title="按状态消耗分布" style={{ marginBottom: 24 }}>
              <Table
                size="small"
                pagination={false}
                rowKey="status"
                dataSource={statusRows}
                columns={[
                  {
                    title: "状态",
                    dataIndex: "status",
                    render: (v: string) => <Tag color={statusColor(v)}>{statusLabel(v)}</Tag>,
                  },
                  { title: "任务数", dataIndex: "taskCount" },
                  {
                    title: "Token 消耗",
                    dataIndex: "tokens",
                    render: (v: number) => v.toLocaleString(),
                  },
                ]}
              />
            </Card>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              marginBottom: 12,
            }}
          >
            <Typography.Title level={5} style={{ margin: 0 }}>
              任务列表
              {summary ? `（共 ${summary.taskCount} 个，已加载 ${jobs.length} 个）` : ""}
            </Typography.Title>
            <Space wrap>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                已选 {selectedJobIds.length} 个
              </Typography.Text>
              <Button
                icon={<CalculatorOutlined />}
                loading={estimateLoading}
                disabled={selectedJobIds.length === 0}
                onClick={onEstimateRemaining}
              >
                估算剩余 Token
              </Button>
            </Space>
          </div>

          <Table
            dataSource={jobs}
            columns={columns}
            rowKey="id"
            size="small"
            pagination={false}
            rowSelection={{
              selectedRowKeys: selectedJobIds,
              onChange: (keys) => setSelectedJobIds(keys.map(String)),
              preserveSelectedRowKeys: true,
              getCheckboxProps: () => ({
                disabled: estimateLoading,
              }),
            }}
          />

          {hasMore && activeFilters && (
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <Button
                loading={loadingMore}
                onClick={() => loadData(activeFilters, true, jobs.length)}
              >
                加载更多
              </Button>
            </div>
          )}
        </Spin>
      )}

      <Drawer
        title="任务详情与翻译内容"
        open={!!selected}
        onClose={() => setSelected(null)}
        width={820}
      >
        {detailLoading ? (
          <Spin />
        ) : selected ? (
          <div>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="任务 ID">
                <Typography.Text copyable style={{ fontSize: 12 }}>
                  {selected.id}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="商店">{selected.shopName}</Descriptions.Item>
              <Descriptions.Item label="语言对">
                {selected.source} → {selected.target}
              </Descriptions.Item>
              <Descriptions.Item label="模块">{selected.modules.join(", ")}</Descriptions.Item>
              <Descriptions.Item label="AI 模型">
                <Tag>{selected.aiModel}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusColor(selected.status)}>{statusLabel(selected.status)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Token 消耗">
                {selected.metrics.usedTokens.toLocaleString()}
              </Descriptions.Item>
            </Descriptions>

            <Typography.Title level={5} style={{ marginTop: 24 }}>
              进度指标
            </Typography.Title>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="初始化">
                {selected.metrics.initDone} / {selected.metrics.initTotal}
              </Descriptions.Item>
              <Descriptions.Item label="翻译">
                {selected.metrics.translateDone} / {selected.metrics.translateTotal}
              </Descriptions.Item>
              <Descriptions.Item label="翻译失败">
                <Typography.Text type={selected.metrics.translateFailed > 0 ? "danger" : undefined}>
                  {selected.metrics.translateFailed}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="写回">
                {selected.metrics.writebackDone} / {selected.metrics.writebackTotal}
              </Descriptions.Item>
            </Descriptions>

            {selected.errorMessage && (
              <Alert
                type="error"
                message={`失败阶段: ${selected.errorStage ?? "未知"}`}
                description={selected.errorMessage}
                style={{ marginTop: 16 }}
                showIcon
              />
            )}

            <Descriptions column={1} bordered size="small" style={{ marginTop: 16 }}>
              <Descriptions.Item label="创建时间">
                {new Date(selected.createdAt).toLocaleString("zh-CN")}
              </Descriptions.Item>
              <Descriptions.Item label="更新时间">
                {new Date(selected.updatedAt).toLocaleString("zh-CN")}
              </Descriptions.Item>
            </Descriptions>

            <TranslationContentViewer job={selected} />
          </div>
        ) : null}
      </Drawer>

      <Drawer
        title={`${activeFilters?.shop ?? ""} — TSF 周期历史`}
        open={tsfHistoryOpen}
        onClose={() => setTsfHistoryOpen(false)}
        width={480}
      >
        {tsfHistoryLoading ? (
          <Spin />
        ) : tsfHistory.length === 0 ? (
          <Typography.Text type="secondary">暂无归档周期记录</Typography.Text>
        ) : (
          <Timeline
            items={tsfHistory.map((h, i) => ({
              key: i,
              color: "blue",
              children: (
                <div>
                  <Typography.Text strong>{h.planKey}</Typography.Text>
                  <br />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {new Date(h.periodStart).toLocaleDateString("zh-CN")} →{" "}
                    {new Date(h.periodEnd).toLocaleDateString("zh-CN")}
                  </Typography.Text>
                  <br />
                  <Typography.Text>
                    已用: <strong>{Number(h.usedCredits).toLocaleString()}</strong> / 配额:{" "}
                    {Number(h.subscriptionCreditsAllocated).toLocaleString()}
                  </Typography.Text>
                </div>
              ),
            }))}
          />
        )}
      </Drawer>

      <Modal
        title="剩余 Token 估算"
        open={!!estimateResult}
        onCancel={() => setEstimateResult(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setEstimateResult(null)}>
            关闭
          </Button>,
        ]}
        width={820}
        destroyOnClose
      >
        {estimateResult && (
          <div>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={`合计约 ${estimateResult.totalEstimatedTokens.toLocaleString()} Token · ${estimateResult.totalPendingFields.toLocaleString()} 条未译字段 · ${estimateResult.jobCount} 个任务`}
              description={
                estimateResult.formula ??
                "按 Blob 未译完条目 originalValue 字符粗估（CJK≈1/2，Latin≈1/4）"
              }
            />
            {estimateResult.missingJobIds.length > 0 && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                message={`有 ${estimateResult.missingJobIds.length} 个任务未找到`}
              />
            )}
            <Table
              size="small"
              rowKey="jobId"
              pagination={false}
              dataSource={estimateResult.jobs}
              columns={[
                {
                  title: "语言对",
                  key: "lang",
                  render: (_: unknown, r) => (
                    <span style={{ fontFamily: MONO, fontSize: 12 }}>
                      {r.source} → {r.target}
                    </span>
                  ),
                },
                {
                  title: "状态",
                  dataIndex: "status",
                  render: (v: string) => (
                    <Tag color={statusColor(v)}>{statusLabel(v)}</Tag>
                  ),
                },
                {
                  title: "估算 Token",
                  dataIndex: "estimatedTokens",
                  sorter: (a, b) => a.estimatedTokens - b.estimatedTokens,
                  defaultSortOrder: "descend" as const,
                  render: (v: number) => (
                    <Typography.Text strong style={{ fontFamily: MONO }}>
                      {v.toLocaleString()}
                    </Typography.Text>
                  ),
                },
                {
                  title: "未译字段",
                  dataIndex: "pendingFields",
                  render: (v: number) => v.toLocaleString(),
                },
                {
                  title: "扫到资源",
                  dataIndex: "scannedResources",
                  render: (v: number) => v.toLocaleString(),
                },
                {
                  title: "备注",
                  dataIndex: "note",
                  ellipsis: true,
                  render: (v?: string) =>
                    v ? (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {v}
                      </Typography.Text>
                    ) : (
                      "—"
                    ),
                },
              ]}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
