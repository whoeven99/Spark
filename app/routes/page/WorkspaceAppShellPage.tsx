import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { LanguageSelector } from "../component/common/LanguageSelector";

type WorkspacePanel = "dashboard" | "chat" | "skills" | "automation" | "tasks";
type AutomationView = "configured" | "history" | "templates";
type TaskKind = "automation" | "one_off";
type TaskStatus = "executing" | "review_required" | "completed" | "failed";
type ObjectType = "product" | "article" | "order";
type ContextTool = ObjectType | "file" | "media";

type Conversation = {
  id: string;
  title: string;
  updatedAt: string;
  preview: string;
  messages: Array<{ role: "assistant" | "user"; text: string; time: string }>;
};

type TaskRecord = {
  id: string;
  title: string;
  kind: TaskKind;
  source: string;
  status: TaskStatus;
  progress: number;
  updatedAt: string;
  summary: string;
  action: string;
};

type DashboardMetric = {
  label: string;
  value: string;
  delta: string;
  tone: "positive" | "negative" | "neutral";
};

type SkillApp = {
  id: string;
  title: string;
  description: string;
  status: string;
  category: string;
};

type AutomationConfiguredItem = {
  id: string;
  title: string;
  schedule: string;
  lastRun: string;
  status: "healthy" | "attention";
  outcome: string;
};

type ObjectOption = {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
};

type LocalFileItem = {
  id: string;
  name: string;
  size: string;
  note: string;
};

type RichMediaItem = {
  id: string;
  title: string;
  kind: "url" | "image" | "video";
  value: string;
  note: string;
};

const panelItems: Array<{ key: Exclude<WorkspacePanel, "chat">; label: string; icon: string }> = [
  { key: "dashboard", label: "经营看板", icon: "◫" },
  { key: "skills", label: "技能", icon: "✦" },
  { key: "automation", label: "自动化", icon: "↻" },
  { key: "tasks", label: "任务列表", icon: "≡" },
];

const objectTypeLabels: Record<ObjectType, string> = {
  product: "商品",
  article: "文章",
  order: "订单",
};

const objectOptions: Record<ObjectType, ObjectOption[]> = {
  product: [
    { id: "prd-1001", title: "Summer Breeze Dress", subtitle: "女装 / 连衣裙 / 夏季新品", meta: "SKU SB-1001 · 库存 28" },
    { id: "prd-1002", title: "Cloud Knit Cardigan", subtitle: "女装 / 针织衫 / 低转化", meta: "SKU CK-2020 · 库存 16" },
    { id: "prd-1003", title: "Travel Mini Bag", subtitle: "配饰 / 包袋 / 高访问", meta: "SKU TB-4402 · 库存 52" },
    { id: "prd-1004", title: "Linen Resort Shirt", subtitle: "男装 / 衬衫 / 夏季新品", meta: "SKU LR-3011 · 库存 9" },
    { id: "prd-1005", title: "Weekend Sandals", subtitle: "鞋履 / 凉鞋 / 广告主推", meta: "SKU WS-2201 · 库存 41" },
  ],
  article: [
    { id: "art-201", title: "夏季穿搭趋势指南", subtitle: "Blog / 内容营销 / 已发布", meta: "最近更新 2 天前 · 浏览 1.2k" },
    { id: "art-202", title: "度假系列面料故事", subtitle: "Blog / 品牌内容 / 草稿", meta: "作者 Luna · 草稿" },
    { id: "art-203", title: "客户常见尺码问题", subtitle: "Help Center / FAQ", meta: "最近更新 1 周前" },
    { id: "art-204", title: "新品上市邮件脚本", subtitle: "Campaign / 邮件素材", meta: "最近使用 昨天" },
  ],
  order: [
    { id: "ord-9101", title: "#9101", subtitle: "美国站 / 高客单 / 待发货", meta: "$182.00 · 2 件商品" },
    { id: "ord-9102", title: "#9102", subtitle: "英国站 / 退款申请", meta: "$64.00 · 退款中" },
    { id: "ord-9103", title: "#9103", subtitle: "美国站 / 异常履约", meta: "$119.00 · 超时 16h" },
    { id: "ord-9104", title: "#9104", subtitle: "日本站 / 正常", meta: "$73.00 · 已发货" },
  ],
};

const initialLocalFiles: LocalFileItem[] = [
  { id: "file-1", name: "brand-guideline.pdf", size: "2.3 MB", note: "品牌语气和禁用词说明" },
  { id: "file-2", name: "product-seo-rules.docx", size: "540 KB", note: "商品标题与描述 SEO 规范" },
];

const initialRichMediaItems: RichMediaItem[] = [
  { id: "media-1", title: "Summer campaign landing", kind: "url", value: "https://spark-demo.shop/summer", note: "活动落地页 URL" },
  { id: "media-2", title: "hero-reference.jpg", kind: "image", value: "https://cdn.spark.demo/hero-reference.jpg", note: "主视觉参考图" },
  { id: "media-3", title: "product-demo.mp4", kind: "video", value: "https://cdn.spark.demo/product-demo.mp4", note: "商品讲解视频" },
];

const initialConversations: Conversation[] = [
  {
    id: "conv-001",
    title: "夏季新品文案优化",
    updatedAt: "刚刚",
    preview: "批量补齐 168 个新品的商品描述",
    messages: [
      { role: "assistant", text: "我已经拿到夏季新品列表。你可以继续补充风格和品牌规则。", time: "09:12" },
      { role: "user", text: "请优先做 SEO 友好的英文商品描述，并保留原有 HTML 结构。", time: "09:13" },
      { role: "assistant", text: "收到，我会先生成一份任务建议，方便你确认范围和消耗。", time: "09:14" },
    ],
  },
  {
    id: "conv-002",
    title: "退款异常复盘",
    updatedAt: "18 分钟前",
    preview: "分析同一 SKU 的退款高峰",
    messages: [
      { role: "assistant", text: "当前退款主要集中在美国站同一 SKU，建议先看最近 7 天移动端订单。", time: "08:42" },
      { role: "user", text: "好，再帮我归纳可以沉淀成自动化监控的规则。", time: "08:44" },
    ],
  },
  {
    id: "conv-003",
    title: "日语翻译批次",
    updatedAt: "1 小时前",
    preview: "继续处理日语与英语翻译任务",
    messages: [{ role: "assistant", text: "这批翻译还缺品牌术语表和禁用词说明。", time: "07:21" }],
  },
  {
    id: "conv-004",
    title: "经营日报生成",
    updatedAt: "昨天",
    preview: "检查日报摘要是否可直接发送",
    messages: [{ role: "assistant", text: "日报草稿已经生成，建议优先突出转化率和退款率波动。", time: "昨天 18:04" }],
  },
];

const dashboardMetrics: DashboardMetric[] = [
  { label: "销售额", value: "$12,540", delta: "+8.4%", tone: "positive" },
  { label: "订单数", value: "186", delta: "+5.1%", tone: "positive" },
  { label: "转化率", value: "2.84%", delta: "-0.3%", tone: "negative" },
  { label: "客单价", value: "$67.4", delta: "+3.8%", tone: "positive" },
  { label: "退款率", value: "1.2%", delta: "-0.4%", tone: "positive" },
  { label: "库存风险 SKU", value: "7", delta: "+2", tone: "negative" },
];

const dashboardSuggestions = [
  "SKU-204 库存仅剩 3 件，建议今天内补货，避免周末断货。",
  "新品系列访问量上涨但转化率偏低，优先补齐商品描述和场景图。",
  "美国站移动端退款率连续 3 天上升，建议排查尺码描述与物流时效。",
  "表现最好的 12 个商品关键词已收敛，可批量同步到同类商品标题。",
];

const dashboardAlerts = [
  { title: "库存预警", detail: "7 个高销量 SKU 库存低于安全阈值", tone: "warning" as const },
  { title: "转化波动", detail: "新品页访问量增加，但转化率低于 7 天均值", tone: "info" as const },
  { title: "退款异常", detail: "美国站某尺码退款订单占比偏高", tone: "critical" as const },
];

const dashboardTaskSummary = [
  { title: "商品描述生成", result: "已完成 24 个商品，预计提升搜索匹配度 3%-5%" },
  { title: "日语翻译", result: "已翻译 42 个商品，准备进入人工审核" },
  { title: "库存预警", result: "今日已发送 150 条预警通知，覆盖 9 个高销量系列" },
];

const skillApps: SkillApp[] = [
  { id: "s1", title: "商品文案优化", description: "批量生成和优化商品标题、卖点与描述。", status: "最近使用", category: "内容" },
  { id: "s2", title: "多语言翻译", description: "支持商品内容、页面文案与术语统一翻译。", status: "可用", category: "翻译" },
  { id: "s3", title: "店铺诊断", description: "汇总经营指标并给出异常原因和建议。", status: "推荐", category: "分析" },
  { id: "s4", title: "图片工具", description: "处理商品图翻译、文生图和素材优化。", status: "可用", category: "视觉" },
  { id: "s5", title: "广告素材建议", description: "结合商品和活动目标生成广告文案建议。", status: "内测", category: "营销" },
  { id: "s6", title: "邮件运营助手", description: "根据商品和分群生成邮件主题与正文。", status: "可用", category: "运营" },
];

const automationConfigured: AutomationConfiguredItem[] = [
  { id: "auto-01", title: "每日经营简报", schedule: "每天 09:00", lastRun: "今天 09:00", status: "healthy", outcome: "已生成日报并推送到工作台" },
  { id: "auto-02", title: "订单异常巡检", schedule: "每 2 小时", lastRun: "10 分钟前", status: "attention", outcome: "发现 6 条高风险订单待复核" },
  { id: "auto-03", title: "库存风险提醒", schedule: "每天 12:00", lastRun: "今天 12:00", status: "healthy", outcome: "已通知 7 个低库存 SKU" },
];

const automationHistory = [
  { id: "run-201", title: "经营简报", detail: "今天 09:00 执行成功，覆盖销售额、订单和退款摘要" },
  { id: "run-200", title: "订单异常巡检", detail: "今天 08:00 执行完成，标记 3 条异常退款订单" },
  { id: "run-199", title: "库存风险提醒", detail: "昨天 12:00 执行完成，推送 9 条补货建议" },
];

const automationTemplates = [
  { id: "tpl-1", title: "新品发布监控", detail: "围绕新品流量、转化和评价生成每日摘要" },
  { id: "tpl-2", title: "退款异常告警", detail: "按站点和 SKU 追踪退款率波动并推送提醒" },
  { id: "tpl-3", title: "SEO 标题优化批次", detail: "定时扫描表现弱的商品并生成标题优化建议" },
];

const initialTasks: TaskRecord[] = [
  { id: "TASK-241198", title: "每日订单异常巡检", kind: "automation", source: "订单监控", status: "executing", progress: 64, updatedAt: "2 分钟前", summary: "正在扫描退款、超时履约和异常金额订单。", action: "查看运行日志" },
  { id: "TASK-241190", title: "多语言商品翻译", kind: "one_off", source: "翻译工具", status: "executing", progress: 51, updatedAt: "11 分钟前", summary: "英语与日语翻译已过半，正在写回结果。", action: "查看进度" },
  { id: "TASK-241177", title: "新品描述补齐", kind: "one_off", source: "AI 对话", status: "review_required", progress: 100, updatedAt: "今天 09:03", summary: "已补齐 24 个新品描述，待人工审核。", action: "进入审核" },
  { id: "TASK-241160", title: "每日经营简报", kind: "automation", source: "经营看板", status: "completed", progress: 100, updatedAt: "今天 09:00", summary: "已生成日报并同步到 Dashboard。", action: "查看简报" },
  { id: "TASK-241155", title: "异常订单重跑", kind: "automation", source: "订单监控", status: "failed", progress: 100, updatedAt: "昨天 19:04", summary: "重跑失败，原因是订单数据源响应超时。", action: "重新执行" },
];

function isWorkspacePanel(value: string | null): value is WorkspacePanel {
  return value === "dashboard" || value === "chat" || value === "skills" || value === "automation" || value === "tasks";
}

function isObjectType(value: ContextTool | null): value is ObjectType {
  return value === "product" || value === "article" || value === "order";
}

export function WorkspaceAppShellPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversationList, setConversationList] = useState<Conversation[]>(initialConversations);
  const [activeConversationId, setActiveConversationId] = useState(initialConversations[0].id);
  const [draftByConversation, setDraftByConversation] = useState<Record<string, string>>({
    "conv-001": "请基于品牌语气和 SEO 规则，补齐这批新品的英文商品描述。",
    "conv-002": "把这次退款异常提炼成可以重复运行的自动化规则。",
    "conv-003": "继续这批商品的日语翻译，并保留品牌术语。",
    "conv-004": "把日报里最重要的经营变化压缩成 3 条结论。",
  });
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, Conversation["messages"]>>(
    Object.fromEntries(initialConversations.map((conversation) => [conversation.id, conversation.messages])),
  );
  const [automationView, setAutomationView] = useState<AutomationView>("configured");
  const [taskFilter, setTaskFilter] = useState<"all" | TaskKind>("all");
  const [activeContextTool, setActiveContextTool] = useState<ContextTool | null>("product");
  const [objectQueryByType, setObjectQueryByType] = useState<Record<ObjectType, string>>({
    product: "",
    article: "",
    order: "",
  });
  const [selectedObjectsByType, setSelectedObjectsByType] = useState<Record<ObjectType, string[]>>({
    product: ["prd-1001", "prd-1004"],
    article: [],
    order: [],
  });
  const [localFiles] = useState<LocalFileItem[]>(initialLocalFiles);
  const [richMediaItems] = useState<RichMediaItem[]>(initialRichMediaItems);

  const panelParam = searchParams.get("panel");
  const activePanel: WorkspacePanel = isWorkspacePanel(panelParam) ? panelParam : "dashboard";
  const activeConversation = conversationList.find((item) => item.id === activeConversationId) ?? conversationList[0];
  const activeMessages = messagesByConversation[activeConversation.id] ?? activeConversation.messages;
  const filteredTasks = useMemo(
    () => (taskFilter === "all" ? initialTasks : initialTasks.filter((task) => task.kind === taskFilter)),
    [taskFilter],
  );

  const switchPanel = (panel: WorkspacePanel) => {
    const next = new URLSearchParams(searchParams);
    if (panel === "dashboard") {
      next.delete("panel");
    } else {
      next.set("panel", panel);
    }
    setSearchParams(next);
  };

  const openConversation = (conversationId: string) => {
    setActiveConversationId(conversationId);
    switchPanel("chat");
  };

  const createConversation = () => {
    const createdAt = new Date();
    const timeLabel = `${String(createdAt.getHours()).padStart(2, "0")}:${String(createdAt.getMinutes()).padStart(2, "0")}`;
    const nextId = `conv-${createdAt.getTime()}`;
    const newConversation: Conversation = {
      id: nextId,
      title: "新对话",
      updatedAt: "刚刚",
      preview: "开始描述你的任务目标、对象和约束。",
      messages: [
        {
          role: "assistant",
          text: "新的对话已经创建。你可以先在下方工具栏补充商品、订单、文章、文件或富媒体，再发送任务需求。",
          time: timeLabel,
        },
      ],
    };

    setConversationList((current) => [newConversation, ...current].slice(0, 50));
    setMessagesByConversation((current) => ({
      ...current,
      [nextId]: newConversation.messages,
    }));
    setDraftByConversation((current) => ({
      ...current,
      [nextId]: "",
    }));
    setActiveConversationId(nextId);
    switchPanel("chat");
  };

  const clearContext = () => {
    setSelectedObjectsByType({ product: [], article: [], order: [] });
    setActiveContextTool(null);
  };

  const toggleObjectSelection = (type: ObjectType, objectId: string) => {
    setSelectedObjectsByType((current) => {
      const currentIds = current[type];
      return {
        ...current,
        [type]: currentIds.includes(objectId)
          ? currentIds.filter((id) => id !== objectId)
          : [...currentIds, objectId],
      };
    });
  };

  const sendMessage = () => {
    const content = (draftByConversation[activeConversation.id] ?? "").trim();
    if (!content) return;

    const nextPreview = content.length > 28 ? `${content.slice(0, 28)}...` : content;
    const nextTitle =
      activeConversation.title === "新对话"
        ? (content.length > 18 ? `${content.slice(0, 18)}...` : content)
        : activeConversation.title;

    setConversationList((current) =>
      current.map((conversation) =>
        conversation.id === activeConversation.id
          ? {
              ...conversation,
              title: nextTitle,
              preview: nextPreview,
              updatedAt: "刚刚",
            }
          : conversation,
      ),
    );
    setMessagesByConversation((current: Record<string, Conversation["messages"]>) => ({
      ...current,
      [activeConversation.id]: [
        ...(current[activeConversation.id] ?? []),
        { role: "user", text: content, time: "刚刚" },
        { role: "assistant", text: "我已经收到你的最新要求。接下来会根据当前上下文整理为任务建议或下一步操作。", time: "刚刚" },
      ],
    }));
    setDraftByConversation((current: Record<string, string>) => ({ ...current, [activeConversation.id]: "" }));
  };

  return (
    <div style={shellStyle}>
      <aside style={sidebarStyle}>
        <div>
          <div style={brandRowStyle}>
            <div style={brandBadgeStyle}>S</div>
            <div>
              <div style={brandTitleStyle}>Spark</div>
              <div style={brandMetaStyle}>Shopify AI Workspace</div>
            </div>
          </div>

          <button type="button" style={newTaskButtonStyle} onClick={createConversation}>
            + 新建对话
          </button>

          <div style={navGroupStyle}>
            {panelItems.map((item) => (
              <button
                key={item.key}
                type="button"
                style={navButtonStyle(activePanel === item.key)}
                onClick={() => switchPanel(item.key)}
              >
                <span style={navLabelStyle}>
                  <span style={navIconStyle}>{item.icon}</span>
                  <span>{item.label}</span>
                </span>
              </button>
            ))}
          </div>

          <div style={sidebarSectionStyle}>
            <div style={sidebarSectionHeadStyle}>
              <span>对话记录</span>
              <span style={mutedMetaStyle}>{Math.min(conversationList.length, 50)} / 50</span>
            </div>
            <div style={conversationListStyle}>
              {conversationList.slice(0, 50).map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  style={historyItemStyle(activeConversationId === conversation.id)}
                  onClick={() => openConversation(conversation.id)}
                >
                  <span style={historyTitleStyle}>{conversation.title}</span>
                  <span style={historyPreviewStyle}>{conversation.preview}</span>
                  <span style={mutedMetaStyle}>{conversation.updatedAt}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={sidebarFooterStyle}>
          <div>
            <div style={brandTitleStyle}>Cedric hu</div>
            <div style={brandMetaStyle}>Spark Workspace</div>
          </div>
          <div style={footerTagStyle}>在线</div>
        </div>
      </aside>

      <main style={contentStyle}>
        <div style={pageHeaderStyle}>
          <div>
            <div style={eyebrowStyle}>Spark Workspace</div>
            <h1 style={pageTitleStyle}>{panelTitle(activePanel)}</h1>
            <p style={pageSubtitleStyle}>{panelSubtitle(activePanel)}</p>
          </div>
          <div style={headerActionsStyle}>
            <LanguageSelector />
          </div>
        </div>

        {activePanel === "dashboard" ? <DashboardPanel /> : null}
        {activePanel === "chat" ? (
          <ChatPanel
            conversation={activeConversation}
            messages={activeMessages}
            draft={draftByConversation[activeConversation.id] ?? ""}
            activeContextTool={activeContextTool}
            objectQueryByType={objectQueryByType}
            selectedObjectsByType={selectedObjectsByType}
            localFiles={localFiles}
            richMediaItems={richMediaItems}
            onDraftChange={(value) =>
              setDraftByConversation((current: Record<string, string>) => ({
                ...current,
                [activeConversation.id]: value,
              }))
            }
            onContextToolChange={(tool) =>
              setActiveContextTool((current) => (current === tool ? null : tool))
            }
            onObjectQueryChange={(type, value) =>
              setObjectQueryByType((current) => ({
                ...current,
                [type]: value,
              }))
            }
            onToggleObjectSelection={toggleObjectSelection}
            onClearContext={clearContext}
            onSend={sendMessage}
          />
        ) : null}
        {activePanel === "skills" ? <SkillsPanel /> : null}
        {activePanel === "automation" ? (
          <AutomationPanel activeView={automationView} onChangeView={setAutomationView} />
        ) : null}
        {activePanel === "tasks" ? (
          <TasksPanel tasks={filteredTasks} filter={taskFilter} onFilterChange={setTaskFilter} />
        ) : null}
      </main>
    </div>
  );
}

function DashboardPanel() {
  return (
    <div style={panelStackStyle}>
      <div style={metricGridStyle}>
        {dashboardMetrics.map((metric) => (
          <article key={metric.label} style={surfaceCardStyle}>
            <div style={metricLabelStyle}>{metric.label}</div>
            <div style={metricValueStyle}>{metric.value}</div>
            <div style={metricDeltaStyle(metric.tone)}>{metric.delta}</div>
          </article>
        ))}
      </div>

      <div style={twoColumnStyle}>
        <section style={surfaceCardStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <div style={sectionTitleStyle}>经营提醒</div>
              <div style={sectionTextStyle}>优先处理影响销售、库存和退款的核心问题。</div>
            </div>
            <button type="button" style={ghostButtonStyle}>查看全部</button>
          </div>
          <div style={alertListStyle}>
            {dashboardAlerts.map((alert) => (
              <div key={alert.title} style={alertItemStyle(alert.tone)}>
                <div style={sectionTitleSmallStyle}>{alert.title}</div>
                <div style={sectionTextStyle}>{alert.detail}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={surfaceCardStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <div style={sectionTitleStyle}>关键趋势</div>
              <div style={sectionTextStyle}>今天、昨天和 7 天均值的简化对比。</div>
            </div>
            <div style={trendLegendStyle}>
              <span style={legendItemStyle("#111827")}>Today</span>
              <span style={legendItemStyle("#94a3b8")}>Yesterday</span>
              <span style={legendItemStyle("#d1d5db")}>7d Avg</span>
            </div>
          </div>
          <div style={chartStyle}>
            {[
              { label: "销售额", values: [88, 74, 66] },
              { label: "订单", values: [72, 68, 61] },
              { label: "转化", values: [49, 54, 57] },
            ].map((group) => (
              <div key={group.label} style={chartRowStyle}>
                <div style={chartLabelStyle}>{group.label}</div>
                <div style={barGroupStyle}>
                  {group.values.map((value, index) => (
                    <div key={`${group.label}-${value}`} style={barTrackStyle}>
                      <div
                        style={{
                          ...barFillStyle,
                          width: `${value}%`,
                          background: index === 0 ? "#111827" : index === 1 ? "#94a3b8" : "#d1d5db",
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div style={twoColumnStyle}>
        <section style={surfaceCardStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <div style={sectionTitleStyle}>AI 自动化执行摘要</div>
              <div style={sectionTextStyle}>今天自动化和单次任务带来的实际产出。</div>
            </div>
            <div style={mutedMetaStyle}>{initialTasks.length} 个任务</div>
          </div>
          <div style={listColumnStyle}>
            {dashboardTaskSummary.map((item) => (
              <div key={item.title} style={summaryItemStyle}>
                <div style={sectionTitleSmallStyle}>{item.title}</div>
                <div style={sectionTextStyle}>{item.result}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={surfaceCardStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <div style={sectionTitleStyle}>经营建议</div>
              <div style={sectionTextStyle}>基于当前店铺数据和任务结果生成的建议。</div>
            </div>
            <button type="button" style={ghostButtonStyle}>生成完整报告</button>
          </div>
          <div style={listColumnStyle}>
            {dashboardSuggestions.map((item) => (
              <div key={item} style={suggestionItemStyle}>
                <span style={bulletStyle} />
                <span style={sectionTextStyle}>{item}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function ChatPanel({
  conversation,
  messages,
  draft,
  activeContextTool,
  objectQueryByType,
  selectedObjectsByType,
  localFiles,
  richMediaItems,
  onDraftChange,
  onContextToolChange,
  onObjectQueryChange,
  onToggleObjectSelection,
  onClearContext,
  onSend,
}: {
  conversation: Conversation;
  messages: Conversation["messages"];
  draft: string;
  activeContextTool: ContextTool | null;
  objectQueryByType: Record<ObjectType, string>;
  selectedObjectsByType: Record<ObjectType, string[]>;
  localFiles: LocalFileItem[];
  richMediaItems: RichMediaItem[];
  onDraftChange: (value: string) => void;
  onContextToolChange: (tool: ContextTool) => void;
  onObjectQueryChange: (type: ObjectType, value: string) => void;
  onToggleObjectSelection: (type: ObjectType, objectId: string) => void;
  onClearContext: () => void;
  onSend: () => void;
}) {
  const [hoveredTool, setHoveredTool] = useState<ContextTool | null>(null);
  const totalSelectedObjects = Object.values(selectedObjectsByType).reduce((count, ids) => count + ids.length, 0);
  const activeObjectOptions = isObjectType(activeContextTool)
    ? objectOptions[activeContextTool].filter((item) => {
        const query = objectQueryByType[activeContextTool].trim().toLowerCase();
        if (!query) return true;
        return `${item.title} ${item.subtitle} ${item.meta}`.toLowerCase().includes(query);
      })
    : [];
  const filledContextCount =
    (totalSelectedObjects > 0 ? 1 : 0) +
    (localFiles.length > 0 ? 1 : 0) +
    (richMediaItems.length > 0 ? 1 : 0);
  const toolItems: Array<{ key: ContextTool; label: string; icon: string; active: boolean }> = [
    { key: "product", label: selectedObjectsByType.product.length > 0 ? `商品 ${selectedObjectsByType.product.length}` : "商品", icon: "◫", active: activeContextTool === "product" },
    { key: "order", label: selectedObjectsByType.order.length > 0 ? `订单 ${selectedObjectsByType.order.length}` : "订单", icon: "◎", active: activeContextTool === "order" },
    { key: "article", label: selectedObjectsByType.article.length > 0 ? `文章 ${selectedObjectsByType.article.length}` : "文章", icon: "≣", active: activeContextTool === "article" },
    { key: "file", label: localFiles.length > 0 ? `文件 ${localFiles.length}` : "文件", icon: "↑", active: activeContextTool === "file" },
    { key: "media", label: richMediaItems.length > 0 ? `富媒体 ${richMediaItems.length}` : "富媒体", icon: "◇", active: activeContextTool === "media" },
  ];

  return (
    <div style={chatLayoutStyle}>
      <section style={{ ...surfaceCardStyle, minHeight: 0 }}>
        <div style={sectionHeaderStyle}>
          <div>
            <div style={sectionTitleStyle}>{conversation.title}</div>
            <div style={sectionTextStyle}>{conversation.preview}</div>
          </div>
          <div style={mutedMetaStyle}>{conversation.updatedAt}</div>
        </div>

        <div style={messageListStyle}>
          {messages.map((message, index) => (
            <div key={`${message.time}-${index}`} style={messageWrapStyle(message.role === "user")}>
              <div style={messageMetaStyle}>
                {message.role === "assistant" ? "Spark AI" : "你"} · {message.time}
              </div>
              <div style={messageBubbleStyle(message.role === "user")}>{message.text}</div>
            </div>
          ))}
        </div>

        <div style={composerBoxStyle}>
          <textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            style={textareaStyle}
            placeholder="继续补充你的任务目标，并结合商品、订单、文章、文件或富媒体上下文..."
          />
          <div style={toolbarDockStyle}>
            <div style={toolbarBarStyle}>
              <div style={toolbarIconGroupStyle}>
                {toolItems.map((item) => (
                  <div key={item.key} style={toolbarTriggerWrapStyle}>
                    <button
                      type="button"
                      style={toolbarIconButtonStyle(item.active)}
                      onClick={() => onContextToolChange(item.key)}
                      onMouseEnter={() => setHoveredTool(item.key)}
                      onMouseLeave={() => setHoveredTool((current) => (current === item.key ? null : current))}
                      title={item.label}
                    >
                      <span style={toolbarIconGlyphStyle}>{item.icon}</span>
                    </button>
                    {hoveredTool === item.key || item.active ? <span style={toolbarTooltipStyle}>{item.label}</span> : null}
                  </div>
                ))}
              </div>
              <div style={toolbarStatusGroupStyle}>
                <span style={toolbarCountStyle}>已补充 {filledContextCount} 项</span>
                <button type="button" style={toolbarClearStyle} onClick={onClearContext}>
                  清空
                </button>
              </div>
            </div>
            {activeContextTool ? (
              <div style={toolbarPopoverStyle}>
                {isObjectType(activeContextTool) ? (
                  <>
                    <div style={selectorPanelHeaderStyle}>
                      <div>
                        <div style={sectionTitleSmallStyle}>{objectTypeLabels[activeContextTool]}选择器</div>
                        <div style={sectionTextStyle}>在当前对话中批量勾选和筛选对象。</div>
                      </div>
                      <span style={statusBadgeStyle("neutral")}>已选 {selectedObjectsByType[activeContextTool].length}</span>
                    </div>
                    <input
                      value={objectQueryByType[activeContextTool]}
                      onChange={(event) => onObjectQueryChange(activeContextTool, event.target.value)}
                      placeholder={`搜索${objectTypeLabels[activeContextTool]}名称、分类或状态`}
                      style={selectorSearchInputStyle}
                    />
                    <div style={selectorListCompactStyle}>
                      {activeObjectOptions.map((item) => {
                        const checked = selectedObjectsByType[activeContextTool].includes(item.id);
                        return (
                          <label key={item.id} style={selectorItemStyle(checked)}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => onToggleObjectSelection(activeContextTool, item.id)}
                            />
                            <div style={selectorItemContentStyle}>
                              <span style={sectionTitleSmallStyle}>{item.title}</span>
                              <span style={sectionTextStyle}>{item.subtitle}</span>
                              <span style={mutedMetaStyle}>{item.meta}</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </>
                ) : null}
                {activeContextTool === "file" ? (
                  <div style={listColumnStyle}>
                    <div style={mutedMetaStyle}>本地上传文件（mock）</div>
                    {localFiles.map((file) => (
                      <div key={file.id} style={summaryItemStyle}>
                        <div style={sectionTitleSmallStyle}>{file.name}</div>
                        <div style={sectionTextStyle}>{file.note}</div>
                        <div style={mutedMetaStyle}>{file.size}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {activeContextTool === "media" ? (
                  <div style={listColumnStyle}>
                    <div style={mutedMetaStyle}>富媒体 URL / 图片 / 视频（mock）</div>
                    {richMediaItems.map((item) => (
                      <div key={item.id} style={summaryItemStyle}>
                        <div style={selectorPanelHeaderStyle}>
                          <div>
                            <div style={sectionTitleSmallStyle}>{item.title}</div>
                            <div style={sectionTextStyle}>{item.note}</div>
                          </div>
                          <span style={summaryChipStyle(true)}>{item.kind}</span>
                        </div>
                        <div style={mutedMetaStyle}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div style={composerFooterStyle}>
            <span style={sectionTextStyle}>每个会话可以继续沉淀为任务或自动化。</span>
            <div style={buttonRowStyle}>
              <button type="button" style={ghostButtonStyle}>生成任务建议</button>
              <button type="button" style={primaryButtonStyle} onClick={onSend}>发送</button>
            </div>
          </div>
        </div>
      </section>

      <section style={sidePanelStyle}>
        <div style={surfaceCardStyle}>
          <div style={sectionTitleStyle}>当前上下文</div>
          <div style={listColumnStyle}>
            {[
              [
                "对象范围",
                totalSelectedObjects > 0
                  ? (Object.keys(objectTypeLabels) as ObjectType[])
                      .filter((type) => selectedObjectsByType[type].length > 0)
                      .map((type) => `${objectTypeLabels[type]} ${selectedObjectsByType[type].length}`)
                      .join(" / ")
                  : "尚未选择对象",
              ],
              ["本地文件", localFiles.length > 0 ? `${localFiles.length} 个已上传文件` : "尚未添加文件"],
              ["富媒体", richMediaItems.length > 0 ? `${richMediaItems.length} 个 URL / 图片 / 视频` : "尚未添加富媒体"],
            ].map(([label, value]) => (
              <div key={label} style={keyValueRowStyle}>
                <span style={mutedMetaStyle}>{label}</span>
                <span style={sectionTextStyle}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={surfaceCardStyle}>
          <div style={sectionTitleStyle}>推荐下一步</div>
          <div style={listColumnStyle}>
            {[
              "先生成任务确认卡片，再统一审核成本和影响范围。",
              "把这次规则保存为自动化，后续可定时执行。",
              "完成后将结果同步到任务列表和 Dashboard。",
            ].map((item) => (
              <div key={item} style={suggestionItemStyle}>
                <span style={bulletStyle} />
                <span style={sectionTextStyle}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function SkillsPanel() {
  return (
    <section style={surfaceCardStyle}>
      <div style={sectionHeaderStyle}>
        <div>
          <div style={sectionTitleStyle}>常用工具</div>
          <div style={sectionTextStyle}>将已有 tools 作为可直接进入的应用入口。</div>
        </div>
        <button type="button" style={ghostButtonStyle}>管理排序</button>
      </div>
      <div style={skillGridStyle}>
        {skillApps.map((skill) => (
          <article key={skill.id} style={skillCardStyle}>
            <div style={skillCategoryStyle}>{skill.category}</div>
            <div style={sectionTitleSmallStyle}>{skill.title}</div>
            <div style={sectionTextStyle}>{skill.description}</div>
            <div style={skillFooterStyle}>
              <span style={statusBadgeStyle("neutral")}>{skill.status}</span>
              <button type="button" style={textButtonStyle}>进入</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function AutomationPanel({
  activeView,
  onChangeView,
}: {
  activeView: AutomationView;
  onChangeView: (value: AutomationView) => void;
}) {
  const items =
    activeView === "configured"
      ? automationConfigured
      : activeView === "history"
        ? automationHistory
        : automationTemplates;

  return (
    <section style={surfaceCardStyle}>
      <div style={sectionHeaderStyle}>
        <div>
          <div style={sectionTitleStyle}>自动化任务</div>
          <div style={sectionTextStyle}>配置和管理可持续运行的任务流。</div>
        </div>
        <div style={buttonRowStyle}>
          <button type="button" style={ghostButtonStyle}>手动新建</button>
          <button type="button" style={primaryButtonStyle}>在对话中创建</button>
        </div>
      </div>

      <div style={tabRowStyle}>
        {[
          ["configured", "已配置"],
          ["history", "执行历史"],
          ["templates", "任务模板"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            style={tabButtonStyle(activeView === key)}
            onClick={() => onChangeView(key as AutomationView)}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={listColumnStyle}>
        {items.map((item) => (
          <article key={item.id} style={automationCardStyle}>
            <div style={sectionHeaderStyle}>
              <div>
                <div style={sectionTitleSmallStyle}>{item.title}</div>
                <div style={sectionTextStyle}>{"schedule" in item ? item.schedule : item.detail}</div>
              </div>
              {"status" in item ? (
                <span style={statusBadgeStyle(item.status === "healthy" ? "positive" : "warning")}>
                  {item.status === "healthy" ? "正常" : "关注中"}
                </span>
              ) : null}
            </div>
            {"lastRun" in item ? <div style={mutedMetaStyle}>最近执行：{item.lastRun}</div> : null}
            {"outcome" in item ? <div style={sectionTextStyle}>{item.outcome}</div> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function TasksPanel({
  tasks,
  filter,
  onFilterChange,
}: {
  tasks: TaskRecord[];
  filter: "all" | TaskKind;
  onFilterChange: (value: "all" | TaskKind) => void;
}) {
  return (
    <section style={surfaceCardStyle}>
      <div style={sectionHeaderStyle}>
        <div>
          <div style={sectionTitleStyle}>统一任务列表</div>
          <div style={sectionTextStyle}>自动化任务与单次任务共用总表，再按类型和状态进行筛选。</div>
        </div>
        <div style={buttonRowStyle}>
          {[
            ["all", "全部"],
            ["automation", "自动化"],
            ["one_off", "单次任务"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              style={filterChipStyle(filter === key)}
              onClick={() => onFilterChange(key as "all" | TaskKind)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={listColumnStyle}>
        {tasks.map((task) => (
          <article key={task.id} style={taskCardStyle}>
            <div style={taskCardTopStyle}>
              <div>
                <div style={mutedMetaStyle}>{task.id}</div>
                <div style={sectionTitleSmallStyle}>{task.title}</div>
              </div>
              <div style={buttonRowStyle}>
                <span style={kindBadgeStyle(task.kind)}>{task.kind === "automation" ? "自动化" : "单次"}</span>
                <span style={statusBadgeStyle(taskStatusTone(task.status))}>{taskStatusLabel(task.status)}</span>
              </div>
            </div>
            <div style={sectionTextStyle}>{task.summary}</div>
            <div style={progressTrackStyle}>
              <div style={{ ...progressFillStyle, width: `${task.progress}%`, background: progressColor(task.status) }} />
            </div>
            <div style={taskFooterStyle}>
              <span style={mutedMetaStyle}>
                {task.source} · {task.updatedAt}
              </span>
              <button type="button" style={textButtonStyle}>{task.action}</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function panelTitle(panel: WorkspacePanel) {
  if (panel === "dashboard") return "经营看板";
  if (panel === "chat") return "任务工作区";
  if (panel === "skills") return "常用工具";
  if (panel === "automation") return "自动化";
  return "任务列表";
}

function panelSubtitle(panel: WorkspacePanel) {
  if (panel === "dashboard") return "默认首页展示店铺经营概况、核心指标、自动化结果和经营建议。";
  if (panel === "chat") return "工作区通过对象工具栏补充上下文，再承接单次任务创建和继续协作。";
  if (panel === "skills") return "技能页作为已有 tools 的聚合入口，每个工具进入独立工作流。";
  if (panel === "automation") return "自动化页聚焦配置、执行历史与模板，不与其他页混排。";
  return "任务列表统一承载自动化任务和单次任务，再按类型和状态过滤。";
}

function taskStatusLabel(status: TaskStatus) {
  if (status === "executing") return "执行中";
  if (status === "review_required") return "待审核";
  if (status === "completed") return "已完成";
  return "失败";
}

function taskStatusTone(status: TaskStatus): "positive" | "warning" | "critical" | "neutral" {
  if (status === "completed") return "positive";
  if (status === "executing" || status === "review_required") return "warning";
  if (status === "failed") return "critical";
  return "neutral";
}

function progressColor(status: TaskStatus) {
  if (status === "completed") return "#008060";
  if (status === "failed") return "#d82c0d";
  return "#c05717";
}

const shellStyle: CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  gridTemplateColumns: "252px minmax(0, 1fr)",
  background: "#f6f6f7",
};

const sidebarStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  padding: "20px 12px 16px",
  borderRight: "1px solid #e1e3e5",
  background: "#f6f6f7",
  gap: 16,
};

const contentStyle: CSSProperties = {
  padding: "28px 32px 40px",
  display: "flex",
  flexDirection: "column",
  gap: 24,
  minWidth: 0,
};

const pageHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  paddingBottom: 18,
  borderBottom: "1px solid #e1e3e5",
};

const eyebrowStyle: CSSProperties = { fontSize: 13, fontWeight: 600, color: "#6d7175", marginBottom: 8 };
const pageTitleStyle: CSSProperties = { margin: 0, fontSize: 28, lineHeight: 1.12, color: "#202223", letterSpacing: "-0.02em" };
const pageSubtitleStyle: CSSProperties = { margin: "8px 0 0", color: "#61666c", fontSize: 14, lineHeight: 1.6, maxWidth: 720 };
const headerActionsStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 10 };

const brandRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  marginBottom: 18,
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid #e1e3e5",
  background: "#ffffff",
};
const brandBadgeStyle: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 9,
  background: "#202223",
  color: "#ffffff",
  display: "grid",
  placeItems: "center",
  fontWeight: 700,
  fontSize: 13,
};
const brandTitleStyle: CSSProperties = { fontSize: 14, fontWeight: 700, color: "#202223" };
const brandMetaStyle: CSSProperties = { fontSize: 12, color: "#6d7175" };

const newTaskButtonStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #202223",
  borderRadius: 10,
  background: "#202223",
  padding: "11px 12px",
  textAlign: "left",
  fontSize: 14,
  fontWeight: 600,
  color: "#ffffff",
  cursor: "pointer",
};

const navGroupStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, marginTop: 14 };
const navButtonStyle = (active: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  border: `1px solid ${active ? "#c9cccf" : "transparent"}`,
  borderRadius: 10,
  background: active ? "#ffffff" : "transparent",
  padding: "10px 12px",
  fontSize: 14,
  fontWeight: active ? 700 : 600,
  color: "#202223",
  cursor: "pointer",
});
const navLabelStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 10 };
const navIconStyle: CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 8,
  display: "grid",
  placeItems: "center",
  background: "#f1f2f3",
  color: "#61666c",
  fontSize: 12,
  flexShrink: 0,
};

const sidebarSectionStyle: CSSProperties = { marginTop: 18, display: "flex", flexDirection: "column", gap: 10, minHeight: 0 };
const sidebarSectionHeadStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, fontWeight: 700, color: "#6d7175", padding: "0 4px" };
const conversationListStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 8, maxHeight: "calc(100vh - 330px)", overflowY: "auto", paddingRight: 2 };
const historyItemStyle = (active: boolean): CSSProperties => ({
  display: "flex",
  flexDirection: "column",
  gap: 4,
  alignItems: "flex-start",
  width: "100%",
  textAlign: "left",
  border: `1px solid ${active ? "#c9cccf" : "transparent"}`,
  borderRadius: 10,
  background: active ? "#ffffff" : "#f6f6f7",
  padding: "10px 12px",
  cursor: "pointer",
});
const historyTitleStyle: CSSProperties = { fontSize: 13, fontWeight: 700, color: "#202223" };
const historyPreviewStyle: CSSProperties = { fontSize: 12, color: "#61666c", lineHeight: 1.5 };
const sidebarFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 10px 0",
  borderTop: "1px solid #e1e3e5",
};
const footerTagStyle: CSSProperties = { padding: "4px 8px", borderRadius: 999, background: "#e9f7ef", color: "#008060", fontSize: 12, fontWeight: 600 };

const panelStackStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 20, minWidth: 0 };
const surfaceCardStyle: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e1e3e5",
  borderRadius: 14,
  boxShadow: "0 1px 0 rgba(0,0,0,0.03)",
  padding: 20,
};
const sectionHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 16 };
const sectionTitleStyle: CSSProperties = { fontSize: 18, fontWeight: 700, color: "#202223", letterSpacing: "-0.01em" };
const sectionTitleSmallStyle: CSSProperties = { fontSize: 15, fontWeight: 700, color: "#202223" };
const sectionTextStyle: CSSProperties = { fontSize: 14, color: "#61666c", lineHeight: 1.6 };
const mutedMetaStyle: CSSProperties = { fontSize: 12, color: "#8c9196" };

const metricGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 };
const metricLabelStyle: CSSProperties = { fontSize: 12, fontWeight: 600, color: "#6d7175" };
const metricValueStyle: CSSProperties = { marginTop: 10, fontSize: 26, fontWeight: 700, color: "#202223", letterSpacing: "-0.02em" };
const metricDeltaStyle = (tone: DashboardMetric["tone"]): CSSProperties => ({
  marginTop: 8,
  fontSize: 12,
  fontWeight: 600,
  color: tone === "positive" ? "#008060" : tone === "negative" ? "#8a2e0f" : "#8c9196",
});

const twoColumnStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 };
const listColumnStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 12 };
const summaryItemStyle: CSSProperties = { padding: 14, borderRadius: 12, border: "1px solid #e9eaeb", background: "#ffffff" };
const suggestionItemStyle: CSSProperties = { display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: "1px solid #f1f2f3" };
const bulletStyle: CSSProperties = { width: 8, height: 8, marginTop: 7, borderRadius: 999, background: "#8c9196", flexShrink: 0 };
const alertListStyle: CSSProperties = { display: "grid", gap: 12 };
const alertItemStyle = (tone: "warning" | "info" | "critical"): CSSProperties => ({
  padding: 14,
  borderRadius: 12,
  border: `1px solid ${tone === "critical" ? "#e4b7af" : tone === "warning" ? "#dfc78a" : "#b8cbeb"}`,
  background: "#ffffff",
});

const trendLegendStyle: CSSProperties = { display: "flex", gap: 12, alignItems: "center" };
const legendItemStyle = (color: string): CSSProperties => ({ fontSize: 12, color, fontWeight: 600 });
const chartStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 16 };
const chartRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "70px minmax(0, 1fr)", gap: 14, alignItems: "center" };
const chartLabelStyle: CSSProperties = { fontSize: 13, fontWeight: 600, color: "#202223" };
const barGroupStyle: CSSProperties = { display: "grid", gap: 8 };
const barTrackStyle: CSSProperties = { height: 10, borderRadius: 999, background: "#f1f2f3", overflow: "hidden" };
const barFillStyle: CSSProperties = { height: "100%", borderRadius: 999 };

const chatLayoutStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 16, minHeight: 0 };
const messageListStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 14, minHeight: 420 };
const messageWrapStyle = (isUser: boolean): CSSProperties => ({ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start", gap: 6 });
const messageMetaStyle: CSSProperties = { fontSize: 12, color: "#8c9196" };
const messageBubbleStyle = (isUser: boolean): CSSProperties => ({
  maxWidth: "78%",
  padding: "12px 14px",
  borderRadius: 14,
  background: isUser ? "#ffffff" : "#f6f6f7",
  border: `1px solid ${isUser ? "#c9cccf" : "#e1e3e5"}`,
  fontSize: 14,
  lineHeight: 1.6,
  color: "#202223",
});
const composerBoxStyle: CSSProperties = { marginTop: 18, paddingTop: 18, borderTop: "1px solid #ebedf0" };
const textareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 120,
  borderRadius: 12,
  border: "1px solid #c9cdd2",
  padding: 14,
  fontSize: 14,
  lineHeight: 1.6,
  color: "#202223",
  background: "#ffffff",
  resize: "vertical",
};
const composerFooterStyle: CSSProperties = { marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 };
const sidePanelStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 16 };
const keyValueRowStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, paddingBottom: 10, borderBottom: "1px solid #f0f1f3" };
const toolbarDockStyle: CSSProperties = { marginTop: 12, position: "relative" };
const toolbarBarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};
const toolbarIconGroupStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
const toolbarTriggerWrapStyle: CSSProperties = { position: "relative", display: "inline-flex" };
const toolbarIconButtonStyle = (active: boolean): CSSProperties => ({
  width: 32,
  height: 32,
  display: "inline-grid",
  placeItems: "center",
  border: `1px solid ${active ? "#202223" : "#dfe3e8"}`,
  background: active ? "#202223" : "#ffffff",
  color: active ? "#ffffff" : "#202223",
  borderRadius: 10,
  padding: 0,
  cursor: "pointer",
});
const toolbarIconGlyphStyle: CSSProperties = { width: 16, textAlign: "center", fontSize: 12, lineHeight: 1 };
const toolbarTooltipStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: "calc(100% + 8px)",
  transform: "translateX(-50%)",
  whiteSpace: "nowrap",
  padding: "4px 8px",
  borderRadius: 8,
  background: "#202223",
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 600,
  boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
  pointerEvents: "none",
  zIndex: 2,
};
const toolbarStatusGroupStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" };
const toolbarCountStyle: CSSProperties = { fontSize: 12, color: "#6d7175", fontWeight: 600 };
const toolbarClearStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#8a2e0f",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  padding: 0,
};
const summaryChipStyle = (active: boolean): CSSProperties => ({
  padding: "6px 10px",
  borderRadius: 999,
  border: `1px solid ${active ? "#c9cccf" : "#e1e3e5"}`,
  background: active ? "#f6f6f7" : "#ffffff",
  color: active ? "#202223" : "#6d7175",
  fontSize: 12,
  fontWeight: 600,
});
const toolbarPopoverStyle: CSSProperties = {
  marginTop: 14,
  padding: 16,
  borderRadius: 12,
  border: "1px solid #e1e3e5",
  background: "#ffffff",
  boxShadow: "0 12px 28px rgba(0,0,0,0.08)",
  maxWidth: 460,
};
const selectorPanelHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 14,
};
const selectorSearchInputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #c9cdd2",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  color: "#202223",
  background: "#ffffff",
};
const selectorListCompactStyle: CSSProperties = { display: "grid", gap: 10, marginTop: 14, maxHeight: 240, overflowY: "auto" };
const selectorItemStyle = (checked: boolean): CSSProperties => ({
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  padding: 12,
  borderRadius: 12,
  border: `1px solid ${checked ? "#c9cccf" : "#e1e3e5"}`,
  background: checked ? "#ffffff" : "#f6f6f7",
});
const selectorItemContentStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };

const skillGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 };
const skillCardStyle: CSSProperties = { padding: 18, borderRadius: 14, border: "1px solid #e1e3e5", background: "#ffffff", display: "flex", flexDirection: "column", gap: 10 };
const skillCategoryStyle: CSSProperties = { fontSize: 12, fontWeight: 700, color: "#6d7175" };
const skillFooterStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 };

const buttonRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 10 };
const primaryButtonStyle: CSSProperties = { border: "1px solid #202223", borderRadius: 10, background: "#202223", color: "#ffffff", padding: "10px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer" };
const ghostButtonStyle: CSSProperties = { border: "1px solid #c9cdd2", borderRadius: 10, background: "#ffffff", color: "#202223", padding: "10px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer" };
const textButtonStyle: CSSProperties = { border: "none", background: "transparent", color: "#005bd3", padding: 0, fontSize: 13, fontWeight: 600, cursor: "pointer" };

const tabRowStyle: CSSProperties = { display: "flex", gap: 8, marginBottom: 16 };
const tabButtonStyle = (active: boolean): CSSProperties => ({
  border: `1px solid ${active ? "#c9cccf" : "#dfe3e8"}`,
  borderRadius: 10,
  background: active ? "#ffffff" : "#f6f6f7",
  color: "#202223",
  padding: "8px 12px",
  fontSize: 13,
  fontWeight: active ? 700 : 600,
  cursor: "pointer",
});
const automationCardStyle: CSSProperties = { padding: 16, borderRadius: 12, border: "1px solid #e1e3e5", background: "#ffffff" };

const filterChipStyle = (active: boolean): CSSProperties => ({
  border: `1px solid ${active ? "#c9cccf" : "#c9cdd2"}`,
  borderRadius: 999,
  background: active ? "#202223" : "#ffffff",
  color: active ? "#ffffff" : "#202223",
  padding: "8px 12px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
});
const taskCardStyle: CSSProperties = { padding: 16, borderRadius: 14, border: "1px solid #e1e3e5", background: "#ffffff", display: "flex", flexDirection: "column", gap: 12 };
const taskCardTopStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 };
const progressTrackStyle: CSSProperties = { height: 8, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" };
const progressFillStyle: CSSProperties = { height: "100%", borderRadius: 999 };
const taskFooterStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 };

const kindBadgeStyle = (kind: TaskKind): CSSProperties => ({
  padding: "4px 10px",
  borderRadius: 999,
  background: kind === "automation" ? "#f1f8ff" : "#f1f2f3",
  color: kind === "automation" ? "#005bd3" : "#61666c",
  fontSize: 12,
  fontWeight: 600,
});
const statusBadgeStyle = (tone: "positive" | "warning" | "critical" | "neutral"): CSSProperties => ({
  padding: "4px 10px",
  borderRadius: 999,
  background: tone === "positive" ? "#e9f7ef" : tone === "warning" ? "#fff5ea" : tone === "critical" ? "#fff1ef" : "#f1f2f3",
  color: tone === "positive" ? "#008060" : tone === "warning" ? "#b98900" : tone === "critical" ? "#d72c0d" : "#61666c",
  fontSize: 12,
  fontWeight: 600,
});
