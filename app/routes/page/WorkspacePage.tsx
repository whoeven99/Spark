import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { LanguageSelector } from "../component/common/LanguageSelector";
import { pageColorTokens } from "./pageUiStyles";

type WorkspacePanel = "dashboard" | "tools" | "chat" | "tasks";
type WorkspaceAppCategory = "content" | "analysis" | "image" | "monitoring" | "chat";
type WorkspaceAppMode = "route" | "chat";
type TaskStatus = "running" | "review_required" | "completed" | "failed";
type TaskSource = "skill" | "chat" | "automation";
type TaskKind = "automation" | "one_off";

type WorkspaceApp = {
  id: string;
  title: string;
  badge: string;
  description: string;
  category: WorkspaceAppCategory;
  mode: WorkspaceAppMode;
  route?: string;
  scenario: string;
  output: string;
  summary: string;
  starterPrompts: string[];
  inputHints: string[];
};

type TaskRecord = {
  id: string;
  title: string;
  source: TaskSource;
  kind: TaskKind;
  toolLabel: string;
  status: TaskStatus;
  summary: string;
  createdAt: string;
  updatedAt: string;
  nextAction: string;
};

type AutomationBoardItem = {
  id: string;
  title: string;
  status: "healthy" | "watch" | "risk";
  frequency: string;
  lastRun: string;
  insight: string;
};

type DashboardMetric = {
  label: string;
  value: string;
  note: string;
};

type DashboardChartPoint = {
  label: string;
  value: number;
};

type ConversationRecord = {
  id: string;
  title: string;
  appId?: string;
  updatedAt: string;
  summary: string;
  messages: Array<{ role: "assistant" | "user"; content: string }>;
};

const workspaceApps: WorkspaceApp[] = [
  {
    id: "ai-assistant",
    title: "AI 对话",
    badge: "AI",
    description: "通过自然语言继续已有工作，或发起新的电商分析与处理任务。",
    category: "chat",
    mode: "chat",
    scenario: "开放式探索、任务澄清、继续追问",
    output: "分析建议、执行方案、后续动作",
    summary: "适合复杂问题、跨工具问题，或需要和 AI 循序澄清的工作。",
    starterPrompts: [
      "帮我看一下最近 7 天店铺表现有什么异常",
      "我准备做夏季促销，先帮我梳理任务清单",
      "继续上一次未完成的经营分析",
    ],
    inputHints: ["问题背景", "想分析的时间范围", "希望输出的结果形式"],
  },
  {
    id: "product-improve",
    title: "商品文案优化",
    badge: "PI",
    description: "生成或优化商品标题、描述和卖点，适合新品上架与老商品重写。",
    category: "content",
    mode: "route",
    route: "/app/product-improve",
    scenario: "商品上新、描述重写、卖点提炼",
    output: "标题、描述、卖点摘要",
    summary: "适合需要结构化输入和任务审核的商品内容工作流。",
    starterPrompts: [
      "帮我写适合美国市场的商品描述",
      "把卖点写得更适合移动端快速阅读",
      "按专业、简洁的品牌语气优化标题",
    ],
    inputHints: ["商品标题", "核心卖点", "目标市场", "语气或风格要求"],
  },
  {
    id: "translation-v4",
    title: "翻译",
    badge: "TR",
    description: "批量处理商品与内容翻译，适合多语言店铺的标准化本地化任务。",
    category: "content",
    mode: "route",
    route: "/app/translation-v4",
    scenario: "商品多语言、本地化扩展、批量翻译",
    output: "翻译任务、语言版本结果、进度记录",
    summary: "适合大量商品内容的任务式翻译，并支持后续审核和追踪。",
    starterPrompts: [
      "我想把商品内容翻译成英语和日语",
      "先帮我梳理这批商品适合哪些目标语言",
      "给我一个批量翻译前的配置建议",
    ],
    inputHints: ["翻译对象范围", "目标语言", "品牌术语限制", "审核要求"],
  },
  {
    id: "image-studio",
    title: "图片工作室",
    badge: "IM",
    description: "处理图片翻译与图片生成任务，适合商品视觉与创意素材制作。",
    category: "image",
    mode: "route",
    route: "/app/image-studio",
    scenario: "图片翻译、营销视觉、创意素材生成",
    output: "图片结果、处理记录、后续下载或应用",
    summary: "适合视觉类任务，既可以做素材生成，也能处理已有图片内容。",
    starterPrompts: [
      "我想把商品主图里的文字翻译成英文",
      "帮我生成适合夏季促销的商品宣传图思路",
      "告诉我图片工作室里应该先选哪个模式",
    ],
    inputHints: ["图片用途", "目标语言或风格", "商品类目", "输出场景"],
  },
  {
    id: "diagnosis",
    title: "店铺诊断",
    badge: "DX",
    description: "查看核心经营指标与近期趋势，快速识别表现异常和优化方向。",
    category: "analysis",
    mode: "route",
    route: "/app/additional",
    scenario: "经营复盘、异常识别、优化建议",
    output: "诊断摘要、关键风险、建议动作",
    summary: "适合先看整体经营情况，再决定是否进入更具体的优化动作。",
    starterPrompts: [
      "先帮我看这周店铺经营指标有没有明显问题",
      "我想知道最近退款风险是不是在上升",
      "帮我从诊断结果里找出最值得优先处理的点",
    ],
    inputHints: ["时间范围", "关注指标", "目标市场", "想解决的问题"],
  },
  {
    id: "order-monitor",
    title: "订单监控",
    badge: "OM",
    description: "追踪订单异常、退款和 SLA 风险，适合日常巡检和问题排查。",
    category: "monitoring",
    mode: "route",
    route: "/app/order-monitor",
    scenario: "异常订单巡检、退款观察、服务风险排查",
    output: "风险订单列表、异常摘要、处理线索",
    summary: "适合持续查看订单问题，后续也适合沉淀为自动化巡检任务。",
    starterPrompts: [
      "今天有哪些订单值得优先排查",
      "帮我看一下异常退款订单的共性",
      "告诉我订单监控里哪些风险最需要每天关注",
    ],
    inputHints: ["时间范围", "订单类型", "风险偏好", "想关注的异常类型"],
  },
];

const dashboardMetrics: DashboardMetric[] = [
  { label: "今日自动化运行", value: "12", note: "较昨日多 3 次" },
  { label: "待处理任务", value: "4", note: "含 2 个自动化异常" },
  { label: "已完成任务", value: "28", note: "单次任务 19 / 自动化 9" },
  { label: "高优先巡检", value: "3", note: "建议优先查看退款与库存波动" },
];

const automationBoard: AutomationBoardItem[] = [
  {
    id: "brief",
    title: "每日店铺简报",
    status: "healthy",
    frequency: "每天 09:00",
    lastRun: "今天 09:00",
    insight: "今日已输出经营摘要，转化率稳定，广告成本下降 6%。",
  },
  {
    id: "refund-watch",
    title: "退款风险监控",
    status: "watch",
    frequency: "每天 16:00",
    lastRun: "今天 16:00",
    insight: "退款订单增加 2 单，集中在同一 SKU，建议优先检查详情页描述。",
  },
  {
    id: "content-check",
    title: "新品文案巡检",
    status: "healthy",
    frequency: "每周一 / 周四",
    lastRun: "昨天 10:30",
    insight: "识别到 7 个新商品需要补齐描述，已生成待优化列表。",
  },
  {
    id: "order-risk",
    title: "订单异常巡检",
    status: "risk",
    frequency: "每天 19:00",
    lastRun: "今天 19:00",
    insight: "巡检中断，订单数据读取超时，建议手动重跑并检查来源接口。",
  },
];

const taskTrend: DashboardChartPoint[] = [
  { label: "Mon", value: 8 },
  { label: "Tue", value: 12 },
  { label: "Wed", value: 10 },
  { label: "Thu", value: 16 },
  { label: "Fri", value: 14 },
  { label: "Sat", value: 9 },
  { label: "Sun", value: 13 },
];

const automationHealth: DashboardChartPoint[] = [
  { label: "健康", value: 68 },
  { label: "关注", value: 22 },
  { label: "风险", value: 10 },
];

const mockTasks: TaskRecord[] = [
  {
    id: "TASK-240601",
    title: "夏季连衣裙商品描述优化",
    source: "skill",
    kind: "one_off",
    toolLabel: "商品文案优化",
    status: "review_required",
    summary: "已生成 12 个商品的描述草稿，等待你确认品牌语气后应用。",
    createdAt: "今天 09:20",
    updatedAt: "今天 09:34",
    nextAction: "去审核",
  },
  {
    id: "TASK-240598",
    title: "多语言商品翻译批次",
    source: "skill",
    kind: "one_off",
    toolLabel: "翻译",
    status: "running",
    summary: "正在处理 38 个商品的英语和日语翻译，预计 6 分钟完成。",
    createdAt: "今天 08:55",
    updatedAt: "2 分钟前",
    nextAction: "查看进度",
  },
  {
    id: "TASK-240591",
    title: "广告投放问题诊断",
    source: "chat",
    kind: "one_off",
    toolLabel: "AI 对话",
    status: "completed",
    summary: "已输出问题诊断摘要与 3 个优先建议，可继续追问或转自动化。",
    createdAt: "昨天 17:40",
    updatedAt: "昨天 18:02",
    nextAction: "继续对话",
  },
  {
    id: "TASK-240584",
    title: "每日订单异常巡检",
    source: "automation",
    kind: "automation",
    toolLabel: "订单监控",
    status: "failed",
    summary: "今日巡检失败，原因是部分订单数据读取超时，需要重试。",
    createdAt: "昨天 09:00",
    updatedAt: "昨天 09:06",
    nextAction: "重新执行",
  },
  {
    id: "TASK-240577",
    title: "商品主图英文化处理",
    source: "skill",
    kind: "one_off",
    toolLabel: "图片工作室",
    status: "completed",
    summary: "已生成 8 张主图的英文化版本，适合进入渠道投放或 A/B 测试。",
    createdAt: "昨天 14:18",
    updatedAt: "昨天 14:42",
    nextAction: "查看结果",
  },
  {
    id: "TASK-240570",
    title: "每日店铺简报",
    source: "automation",
    kind: "automation",
    toolLabel: "店铺诊断",
    status: "completed",
    summary: "自动生成今日经营摘要并同步到工作台，建议优先关注广告 ROAS。",
    createdAt: "今天 09:00",
    updatedAt: "今天 09:03",
    nextAction: "查看简报",
  },
];

const conversationRecords: ConversationRecord[] = Array.from({ length: 12 }).map((_, index) => {
  const app = workspaceApps[index % workspaceApps.length];
  const id = `CONV-${240700 - index}`;
  return {
    id,
    title:
      index === 0
        ? "夏季促销计划梳理"
        : index === 1
          ? "退款异常复盘"
          : `${app.title} 对话 ${index + 1}`,
    appId: app.id,
    updatedAt: index === 0 ? "刚刚" : index === 1 ? "12 分钟前" : `${index + 1} 小时前`,
    summary: `围绕 ${app.title} 继续推进的对话记录，可回看上下文和结果。`,
    messages: [
      {
        role: "assistant",
        content: `这里是“${app.title}”的对话记录，我会基于已有上下文继续完成任务。`,
      },
      {
        role: "user",
        content: app.starterPrompts[0],
      },
      {
        role: "assistant",
        content: `已记录你的目标。我会结合 ${app.scenario} 的场景给出下一步方案，并尽量沉淀成可追踪任务。`,
      },
    ],
  };
});

const sidebarItems: Array<{ key: WorkspacePanel; label: string; hint: string }> = [
  { key: "dashboard", label: "Dashboard", hint: "每日看板" },
  { key: "tools", label: "常用工具", hint: "内置 app 入口" },
  { key: "chat", label: "对话", hint: "查看与继续记录" },
  { key: "tasks", label: "任务列表", hint: "自动化与单次任务" },
];

const categoryLabels: Record<WorkspaceAppCategory | "all", string> = {
  all: "全部",
  content: "内容",
  analysis: "分析",
  image: "图像",
  monitoring: "监控",
  chat: "对话",
};

const panelLabels: Record<WorkspacePanel, string> = {
  dashboard: "Dashboard",
  tools: "常用工具",
  chat: "对话",
  tasks: "任务列表",
};

export function WorkspacePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [category, setCategory] = useState<WorkspaceAppCategory | "all">("all");
  const [taskStatusFilter, setTaskStatusFilter] = useState<"all" | TaskStatus>("all");
  const [taskKindFilter, setTaskKindFilter] = useState<"all" | TaskKind>("all");

  const panel = parsePanel(searchParams.get("panel"));
  const selectedAppId = searchParams.get("app");
  const selectedConversationId = searchParams.get("conversation");
  const selectedApp = workspaceApps.find((item) => item.id === selectedAppId) ?? null;
  const selectedConversation =
    conversationRecords.find((record) => record.id === selectedConversationId) ?? conversationRecords[0];

  const filteredApps = useMemo(() => {
    if (category === "all") return workspaceApps;
    return workspaceApps.filter((item) => item.category === category);
  }, [category]);

  const filteredTasks = useMemo(() => {
    return mockTasks.filter((task) => {
      const matchesStatus = taskStatusFilter === "all" || task.status === taskStatusFilter;
      const matchesKind = taskKindFilter === "all" || task.kind === taskKindFilter;
      return matchesStatus && matchesKind;
    });
  }, [taskKindFilter, taskStatusFilter]);

  const runningCount = mockTasks.filter((item) => item.status === "running").length;
  const pendingCount = mockTasks.filter((item) => item.status === "review_required").length;
  const automationCount = mockTasks.filter((item) => item.kind === "automation").length;
  const recentConversations = conversationRecords.slice(0, 50);

  const setPanel = (nextPanel: WorkspacePanel, options?: { appId?: string; conversationId?: string }) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("panel", nextPanel);
    if (options?.appId) nextParams.set("app", options.appId);
    else nextParams.delete("app");
    if (options?.conversationId) nextParams.set("conversation", options.conversationId);
    else nextParams.delete("conversation");
    setSearchParams(nextParams);
  };

  const openApp = (app: WorkspaceApp) => {
    if (app.mode === "route" && app.route) {
      navigate(app.route);
      return;
    }
    setPanel("chat", { appId: app.id });
  };

  const openContextChat = (app: WorkspaceApp) => {
    setPanel("chat", { appId: app.id });
  };

  const openConversation = (conversationId: string) => {
    setPanel("chat", { conversationId });
  };

  return (
    <div style={workspaceShellStyle}>
      <aside style={workspaceSidebarStyle}>
        <div style={brandBlockStyle}>
          <div style={brandBadgeStyle}>SP</div>
          <div>
            <div style={brandTitleStyle}>Spark Workspace</div>
            <div style={brandSubtitleStyle}>电商 AI 工作台</div>
          </div>
        </div>

        <div style={{ display: "grid", gap: "0.45rem" }}>
          {sidebarItems.map((item) => {
            const active = panel === item.key;
            return (
              <button
                key={item.key}
                type="button"
                style={sidebarItemStyle(active)}
                onClick={() => setPanel(item.key)}
              >
                <span style={sidebarItemLabelStyle}>{item.label}</span>
                <span style={sidebarItemHintStyle}>{item.hint}</span>
              </button>
            );
          })}
        </div>

        <div style={sidebarSummaryCardStyle}>
          <div style={summaryMiniLabelStyle}>今日概览</div>
          <div style={summaryStatRowStyle}>
            <span>运行中任务</span>
            <strong>{runningCount}</strong>
          </div>
          <div style={summaryStatRowStyle}>
            <span>待处理任务</span>
            <strong>{pendingCount}</strong>
          </div>
          <div style={summaryStatRowStyle}>
            <span>自动化任务</span>
            <strong>{automationCount}</strong>
          </div>
        </div>

        <div style={sidebarHistoryCardStyle}>
          <div style={sidebarHistoryHeaderStyle}>
            <span style={summaryMiniLabelStyle}>对话记录</span>
            <span style={sidebarHistoryMetaStyle}>最多 50 条</span>
          </div>
          <div style={conversationListStyle}>
            {recentConversations.map((conversation) => {
              const active = panel === "chat" && selectedConversation.id === conversation.id;
              return (
                <button
                  key={conversation.id}
                  type="button"
                  style={conversationItemStyle(active)}
                  onClick={() => openConversation(conversation.id)}
                >
                  <span style={conversationItemTitleStyle}>{conversation.title}</span>
                  <span style={conversationItemMetaStyle}>{conversation.updatedAt}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: "auto" }}>
          <div style={userCardStyle}>
            <div style={userAvatarStyle}>CH</div>
            <div>
              <div style={userNameStyle}>Cedric hu</div>
              <div style={userMetaStyle}>Spark Ultra</div>
            </div>
          </div>
        </div>
      </aside>

      <main style={workspaceMainStyle}>
        <div style={workspacePageHeaderStyle}>
          <div>
            <div style={workspacePageEyebrowStyle}>Workspace</div>
            <h1 style={workspacePageTitleStyle}>{panelLabels[panel]}</h1>
            <p style={workspacePageSubtitleStyle}>
              {panel === "dashboard"
                ? "把自动化任务、运行状态和任务趋势汇总到每日看板，作为默认首页。"
                : panel === "tools"
                  ? "常用工具页集中展示 Spark 的内置 app，直接进入已有工具页或上下文对话。"
                  : panel === "chat"
                    ? "对话页用于查看记录内容，也支持从工具入口进入带上下文的会话。"
                    : "统一查看自动化任务与单次任务，支持按类型和状态筛选。"}
            </p>
          </div>
          <div style={headerActionsStyle}>
            <button type="button" style={secondaryActionStyle} onClick={() => setPanel("chat")}>继续对话</button>
            <button type="button" style={primaryActionStyle} onClick={() => setPanel("dashboard")}>返回 Dashboard</button>
          </div>
        </div>

        {panel === "dashboard" ? (
          <DashboardPanel onOpenTasks={() => setPanel("tasks")} onOpenTools={() => setPanel("tools")} />
        ) : null}

        {panel === "tools" ? (
          <ToolsPanel
            apps={filteredApps}
            category={category}
            onSelectCategory={setCategory}
            onOpenApp={openApp}
            onOpenContextChat={openContextChat}
          />
        ) : null}

        {panel === "chat" ? (
          <ChatPanel
            app={selectedApp}
            conversation={selectedConversation}
            onBackToTools={() => setPanel("tools")}
            onOpenApp={openApp}
            onOpenTaskList={() => setPanel("tasks")}
          />
        ) : null}

        {panel === "tasks" ? (
          <TasksPanel
            tasks={filteredTasks}
            taskStatusFilter={taskStatusFilter}
            taskKindFilter={taskKindFilter}
            onStatusFilterChange={setTaskStatusFilter}
            onKindFilterChange={setTaskKindFilter}
            onOpenChat={() => setPanel("chat")}
          />
        ) : null}

        <div style={{ marginTop: "1rem" }}>
          <LanguageSelector />
        </div>
      </main>
    </div>
  );
}

function DashboardPanel({
  onOpenTasks,
  onOpenTools,
}: {
  onOpenTasks: () => void;
  onOpenTools: () => void;
}) {
  return (
    <div style={contentColumnStyle}>
      <section style={surfaceCardStyle}>
        <div style={sectionHeaderRowStyle}>
          <div>
            <div style={sectionKickerStyle}>默认首页</div>
            <h2 style={sectionTitleStyle}>每日看板</h2>
            <p style={sectionDescriptionStyle}>
              这里汇总自动化任务的运行状态、近 7 天执行趋势和今天值得优先处理的事项，让首页先回答“今天要看什么”。
            </p>
          </div>
          <div style={headerActionsStyle}>
            <button type="button" style={secondaryActionStyle} onClick={onOpenTools}>打开常用工具</button>
            <button type="button" style={primaryActionStyle} onClick={onOpenTasks}>查看全部任务</button>
          </div>
        </div>
        <div style={metricGridStyle}>
          {dashboardMetrics.map((metric) => (
            <MetricCard key={metric.label} label={metric.label} value={metric.value} note={metric.note} />
          ))}
        </div>
      </section>

      <section style={dashboardGridStyle}>
        <div style={surfaceCardStyle}>
          <div style={sectionHeaderRowStyle}>
            <div>
              <h3 style={sectionCardTitleStyle}>自动化任务</h3>
              <p style={sectionCardDescriptionStyle}>每天都需要看的自动化运行状态与摘要。</p>
            </div>
          </div>
          <div style={listColumnStyle}>
            {automationBoard.map((item) => (
              <article key={item.id} style={boardTaskCardStyle}>
                <div style={taskCardTopRowStyle}>
                  <div>
                    <h4 style={taskTitleStyle}>{item.title}</h4>
                    <div style={listRowMetaStyle}>{item.frequency} · 最近运行 {item.lastRun}</div>
                  </div>
                  <span style={boardStatusPillStyle(item.status)}>{formatBoardStatus(item.status)}</span>
                </div>
                <p style={taskSummaryStyle}>{item.insight}</p>
              </article>
            ))}
          </div>
        </div>

        <div style={dashboardSideColumnStyle}>
          <div style={surfaceCardStyle}>
            <div style={sectionHeaderRowStyle}>
              <div>
                <h3 style={sectionCardTitleStyle}>任务趋势</h3>
                <p style={sectionCardDescriptionStyle}>近 7 天任务总量变化</p>
              </div>
            </div>
            <MiniBarChart data={taskTrend} unit="次" />
          </div>

          <div style={surfaceCardStyle}>
            <div style={sectionHeaderRowStyle}>
              <div>
                <h3 style={sectionCardTitleStyle}>自动化健康度</h3>
                <p style={sectionCardDescriptionStyle}>按今日状态分布统计</p>
              </div>
            </div>
            <MiniBarChart data={automationHealth} unit="%" colorMode="status" />
          </div>
        </div>
      </section>
    </div>
  );
}

function ToolsPanel({
  apps,
  category,
  onSelectCategory,
  onOpenApp,
  onOpenContextChat,
}: {
  apps: WorkspaceApp[];
  category: WorkspaceAppCategory | "all";
  onSelectCategory: (category: WorkspaceAppCategory | "all") => void;
  onOpenApp: (app: WorkspaceApp) => void;
  onOpenContextChat: (app: WorkspaceApp) => void;
}) {
  return (
    <div style={contentColumnStyle}>
      <section style={surfaceCardStyle}>
        <div style={sectionHeaderRowStyle}>
          <div>
            <h3 style={sectionCardTitleStyle}>常用工具</h3>
            <p style={sectionCardDescriptionStyle}>把现有 tools 以内置 app 的方式统一展示，直接进入真实工具页或上下文对话。</p>
          </div>
        </div>
        <div style={tabRowStyle}>
          {Object.entries(categoryLabels).map(([value, label]) => {
            const active = category === value;
            return (
              <button
                key={value}
                type="button"
                style={tabButtonStyle(active)}
                onClick={() => onSelectCategory(value as WorkspaceAppCategory | "all")}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      <section style={surfaceCardStyle}>
        <div style={sectionHeaderRowStyle}>
          <div>
            <h3 style={sectionCardTitleStyle}>推荐工具</h3>
            <p style={sectionCardDescriptionStyle}>优先展示最常用的工作入口。</p>
          </div>
        </div>
        <div style={cardGridStyle}>
          {workspaceApps.slice(0, 4).map((app) => (
            <AppCard key={app.id} app={app} onOpenApp={onOpenApp} onOpenContextChat={onOpenContextChat} />
          ))}
        </div>
      </section>

      <section style={surfaceCardStyle}>
        <div style={sectionHeaderRowStyle}>
          <div>
            <h3 style={sectionCardTitleStyle}>全部工具</h3>
            <p style={sectionCardDescriptionStyle}>当前分类：{categoryLabels[category]}。</p>
          </div>
        </div>
        <div style={cardGridStyle}>
          {apps.map((app) => (
            <AppCard key={app.id} app={app} onOpenApp={onOpenApp} onOpenContextChat={onOpenContextChat} />
          ))}
        </div>
      </section>
    </div>
  );
}

function AppCard({
  app,
  onOpenApp,
  onOpenContextChat,
}: {
  app: WorkspaceApp;
  onOpenApp: (app: WorkspaceApp) => void;
  onOpenContextChat: (app: WorkspaceApp) => void;
}) {
  return (
    <article style={appCardStyle}>
      <div style={appCardHeaderStyle}>
        <div style={appBadgeStyle}>{app.badge}</div>
        <span style={modeBadgeStyle(app.mode)}>{app.mode === "route" ? "工具页" : "对话"}</span>
      </div>
      <h4 style={appTitleStyle}>{app.title}</h4>
      <p style={appDescriptionStyle}>{app.description}</p>
      <div style={metaPanelStyle}>
        <div style={metaLabelStyle}>适用场景</div>
        <div style={metaValueStyle}>{app.scenario}</div>
      </div>
      <div style={metaPanelStyle}>
        <div style={metaLabelStyle}>输出结果</div>
        <div style={metaValueStyle}>{app.output}</div>
      </div>
      <p style={appSummaryStyle}>{app.summary}</p>
      <div style={cardActionsStyle}>
        <button type="button" style={primaryActionStyle} onClick={() => onOpenApp(app)}>
          {app.mode === "route" ? "打开工具" : "开始对话"}
        </button>
        {app.mode === "route" ? (
          <button type="button" style={secondaryActionStyle} onClick={() => onOpenContextChat(app)}>
            上下文对话
          </button>
        ) : null}
      </div>
    </article>
  );
}

function ChatPanel({
  app,
  conversation,
  onBackToTools,
  onOpenApp,
  onOpenTaskList,
}: {
  app: WorkspaceApp | null;
  conversation: ConversationRecord;
  onBackToTools: () => void;
  onOpenApp: (app: WorkspaceApp) => void;
  onOpenTaskList: () => void;
}) {
  const contextApp = app ?? workspaceApps.find((item) => item.id === conversation.appId) ?? workspaceApps[0];
  const messages = app ? buildDraftMessages(contextApp) : conversation.messages;

  return (
    <div style={contentColumnStyle}>
      <section style={surfaceCardStyle}>
        <div style={sectionHeaderRowStyle}>
          <div>
            <div style={sectionKickerStyle}>{app ? "上下文对话" : "对话记录"}</div>
            <h3 style={sectionCardTitleStyle}>{app ? contextApp.title : conversation.title}</h3>
            <p style={sectionCardDescriptionStyle}>{app ? contextApp.description : conversation.summary}</p>
          </div>
          <div style={headerActionsStyle}>
            <button type="button" style={secondaryActionStyle} onClick={onBackToTools}>返回常用工具</button>
            {contextApp.mode === "route" ? (
              <button type="button" style={primaryActionStyle} onClick={() => onOpenApp(contextApp)}>打开真实工具页</button>
            ) : null}
          </div>
        </div>

        <div style={twoColumnPreviewStyle}>
          <div style={contextIntroCardStyle}>
            <div style={contextSectionTitleStyle}>当前任务目标</div>
            <p style={contextBodyStyle}>{contextApp.summary}</p>
            <div style={contextSectionTitleStyle}>建议输入</div>
            <ul style={listStyle}>
              {contextApp.inputHints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
            <div style={contextSectionTitleStyle}>推荐起手问题</div>
            <div style={promptChipWrapStyle}>
              {contextApp.starterPrompts.map((prompt) => (
                <span key={prompt} style={promptChipStyle}>{prompt}</span>
              ))}
            </div>
          </div>

          <div style={conversationStageStyle}>
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} style={conversationBubbleStyle(message.role)}>
                <div style={bubbleMetaStyle}>{message.role === "assistant" ? "Assistant" : "You"}</div>
                <div style={bubbleContentStyle}>{message.content}</div>
              </div>
            ))}

            <div style={composerShellStyle}>
              <div style={composerHintStyle}>{app ? "上下文对话输入框" : `记录编号 ${conversation.id}`}</div>
              <div style={composerFieldStyle}>{contextApp.inputHints.join(" / ")}</div>
              <div style={composerActionsStyle}>
                <button type="button" style={secondaryActionStyle} onClick={onOpenTaskList}>查看任务列表</button>
                <button type="button" style={primaryActionStyle}>{app ? "开始执行" : "继续此对话"}</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function TasksPanel({
  tasks,
  taskStatusFilter,
  taskKindFilter,
  onStatusFilterChange,
  onKindFilterChange,
  onOpenChat,
}: {
  tasks: TaskRecord[];
  taskStatusFilter: "all" | TaskStatus;
  taskKindFilter: "all" | TaskKind;
  onStatusFilterChange: (filter: "all" | TaskStatus) => void;
  onKindFilterChange: (filter: "all" | TaskKind) => void;
  onOpenChat: () => void;
}) {
  return (
    <div style={contentColumnStyle}>
      <section style={surfaceCardStyle}>
        <div style={sectionHeaderRowStyle}>
          <div>
            <div style={sectionKickerStyle}>统一任务总表</div>
            <h3 style={sectionCardTitleStyle}>区分自动化任务和单次任务</h3>
            <p style={sectionCardDescriptionStyle}>自动化运行结果和单次执行任务统一汇总，但可按任务类型分开查看。</p>
          </div>
          <button type="button" style={secondaryActionStyle} onClick={onOpenChat}>继续对话</button>
        </div>

        <div style={filterPanelStyle}>
          <div style={filterGroupStyle}>
            <span style={filterLabelStyle}>任务类型</span>
            <div style={tabRowStyle}>
              {[
                ["all", "全部"],
                ["automation", "自动化任务"],
                ["one_off", "单次任务"],
              ].map(([value, label]) => {
                const active = taskKindFilter === value;
                return (
                  <button
                    key={value}
                    type="button"
                    style={tabButtonStyle(active)}
                    onClick={() => onKindFilterChange(value as "all" | TaskKind)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={filterGroupStyle}>
            <span style={filterLabelStyle}>状态</span>
            <div style={tabRowStyle}>
              {[
                ["all", "全部"],
                ["running", "进行中"],
                ["review_required", "待处理"],
                ["completed", "已完成"],
                ["failed", "失败"],
              ].map(([value, label]) => {
                const active = taskStatusFilter === value;
                return (
                  <button
                    key={value}
                    type="button"
                    style={tabButtonStyle(active)}
                    onClick={() => onStatusFilterChange(value as "all" | TaskStatus)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div style={listColumnStyle}>
          {tasks.map((task) => (
            <article key={task.id} style={taskCardStyle}>
              <div style={taskCardTopRowStyle}>
                <div>
                  <div style={taskIdStyle}>{task.id}</div>
                  <h4 style={taskTitleStyle}>{task.title}</h4>
                </div>
                <div style={taskBadgeRowStyle}>
                  <span style={kindPillStyle(task.kind)}>{task.kind === "automation" ? "自动化任务" : "单次任务"}</span>
                  <span style={statusPillStyle(task.status)}>{formatTaskStatus(task.status)}</span>
                </div>
              </div>
              <div style={taskSummaryStyle}>{task.summary}</div>
              <div style={taskMetaGridStyle}>
                <div style={metaPanelStyle}>
                  <div style={metaLabelStyle}>来源</div>
                  <div style={metaValueStyle}>{formatTaskSource(task.source)}</div>
                </div>
                <div style={metaPanelStyle}>
                  <div style={metaLabelStyle}>所属 app</div>
                  <div style={metaValueStyle}>{task.toolLabel}</div>
                </div>
                <div style={metaPanelStyle}>
                  <div style={metaLabelStyle}>创建时间</div>
                  <div style={metaValueStyle}>{task.createdAt}</div>
                </div>
                <div style={metaPanelStyle}>
                  <div style={metaLabelStyle}>最近更新</div>
                  <div style={metaValueStyle}>{task.updatedAt}</div>
                </div>
              </div>
              <div style={cardActionsStyle}>
                <button type="button" style={primaryActionStyle}>{task.nextAction}</button>
                <button type="button" style={secondaryActionStyle}>查看详情</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function MiniBarChart({
  data,
  unit,
  colorMode = "default",
}: {
  data: DashboardChartPoint[];
  unit: string;
  colorMode?: "default" | "status";
}) {
  const max = Math.max(...data.map((item) => item.value));

  return (
    <div style={chartWrapStyle}>
      {data.map((point) => (
        <div key={point.label} style={chartRowStyle}>
          <div style={chartLabelStyle}>{point.label}</div>
          <div style={chartTrackStyle}>
            <div
              style={chartBarStyle(
                (point.value / max) * 100,
                colorMode === "status" ? point.label : undefined,
              )}
            />
          </div>
          <div style={chartValueStyle}>{point.value}{unit}</div>
        </div>
      ))}
    </div>
  );
}

function MetricCard({ label, value, note }: DashboardMetric) {
  return (
    <div style={metricCardStyle}>
      <div style={summaryMiniLabelStyle}>{label}</div>
      <div style={metricValueStyle}>{value}</div>
      <div style={metricNoteStyle}>{note}</div>
    </div>
  );
}

function buildDraftMessages(app: WorkspaceApp) {
  return [
    {
      role: "assistant" as const,
      content: `我已经进入“${app.title}”的上下文模式。你可以直接输入任务目标、对象范围和预期结果。`,
    },
    {
      role: "user" as const,
      content: app.starterPrompts[0],
    },
    {
      role: "assistant" as const,
      content: `好的，我会先按“${app.scenario}”的目标理解任务，并在有需要时给出结构化建议、结果草稿或下一步动作。`,
    },
  ];
}

function parsePanel(rawPanel: string | null): WorkspacePanel {
  if (rawPanel === "tools" || rawPanel === "chat" || rawPanel === "tasks") {
    return rawPanel;
  }
  return "dashboard";
}

function formatTaskStatus(status: TaskStatus) {
  switch (status) {
    case "running":
      return "进行中";
    case "review_required":
      return "待处理";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
  }
}

function formatTaskSource(source: TaskSource) {
  switch (source) {
    case "skill":
      return "工具";
    case "chat":
      return "对话";
    case "automation":
      return "自动化";
  }
}

function formatBoardStatus(status: AutomationBoardItem["status"]) {
  switch (status) {
    case "healthy":
      return "正常";
    case "watch":
      return "关注";
    case "risk":
      return "风险";
  }
}

const workspaceShellStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "280px minmax(0, 1fr)",
  gap: "1rem",
  minHeight: "calc(100dvh - 48px)",
  padding: "1rem",
  background: "#f6f6f7",
};

const workspaceSidebarStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  padding: "1rem",
  borderRadius: "18px",
  background: "linear-gradient(180deg, #eef0f3 0%, #f7f7f8 100%)",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
  minHeight: 0,
};

const workspaceMainStyle: CSSProperties = {
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};

const workspacePageHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "1rem",
  alignItems: "flex-start",
  padding: "1.2rem 1.25rem",
  borderRadius: "18px",
  background: "#ffffff",
  border: `1px solid ${pageColorTokens.border}`,
  boxShadow: pageColorTokens.shadowCard,
};

const workspacePageEyebrowStyle: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: pageColorTokens.textSecondary,
  marginBottom: "0.35rem",
};

const workspacePageTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "1.75rem",
  lineHeight: 1.2,
  color: pageColorTokens.textPrimary,
};

const workspacePageSubtitleStyle: CSSProperties = {
  margin: "0.45rem 0 0",
  maxWidth: "48rem",
  fontSize: "0.95rem",
  lineHeight: 1.55,
  color: pageColorTokens.textSecondary,
};

const headerActionsStyle: CSSProperties = {
  display: "flex",
  gap: "0.65rem",
  flexWrap: "wrap",
};

const brandBlockStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.8rem",
  paddingBottom: "0.2rem",
};

const brandBadgeStyle: CSSProperties = {
  width: "42px",
  height: "42px",
  borderRadius: "12px",
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(135deg, #00a67c 0%, #4070f4 100%)",
  color: "#fff",
  fontWeight: 800,
  fontSize: "0.9rem",
};

const brandTitleStyle: CSSProperties = {
  fontSize: "1rem",
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const brandSubtitleStyle: CSSProperties = {
  fontSize: "0.8rem",
  color: pageColorTokens.textSecondary,
};

const sidebarItemStyle = (active: boolean): CSSProperties => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "0.18rem",
  width: "100%",
  padding: "0.85rem 0.9rem",
  borderRadius: "12px",
  border: `1px solid ${active ? "rgba(64,112,244,0.24)" : "transparent"}`,
  background: active ? "rgba(255,255,255,0.82)" : "transparent",
  boxShadow: active ? "0 1px 4px rgba(0,0,0,0.04)" : "none",
  color: pageColorTokens.textPrimary,
  cursor: "pointer",
  textAlign: "left",
});

const sidebarItemLabelStyle: CSSProperties = {
  fontSize: "0.95rem",
  fontWeight: 700,
};

const sidebarItemHintStyle: CSSProperties = {
  fontSize: "0.75rem",
  color: pageColorTokens.textSecondary,
};

const sidebarSummaryCardStyle: CSSProperties = {
  padding: "0.95rem",
  borderRadius: "14px",
  background: "rgba(255,255,255,0.82)",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  display: "grid",
  gap: "0.55rem",
};

const sidebarHistoryCardStyle: CSSProperties = {
  padding: "0.95rem",
  borderRadius: "14px",
  background: "rgba(255,255,255,0.72)",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  display: "grid",
  gap: "0.7rem",
  minHeight: 0,
  flex: 1,
};

const sidebarHistoryHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "0.5rem",
  alignItems: "center",
};

const sidebarHistoryMetaStyle: CSSProperties = {
  fontSize: "0.72rem",
  color: pageColorTokens.textSecondary,
};

const conversationListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.45rem",
  overflowY: "auto",
  paddingRight: "0.15rem",
};

const conversationItemStyle = (active: boolean): CSSProperties => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "0.18rem",
  width: "100%",
  padding: "0.7rem 0.8rem",
  borderRadius: "12px",
  border: `1px solid ${active ? "rgba(64,112,244,0.22)" : pageColorTokens.borderSubtle}`,
  background: active ? "rgba(64,112,244,0.07)" : "#fff",
  cursor: "pointer",
  textAlign: "left",
});

const conversationItemTitleStyle: CSSProperties = {
  fontSize: "0.82rem",
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const conversationItemMetaStyle: CSSProperties = {
  fontSize: "0.72rem",
  color: pageColorTokens.textSecondary,
};

const summaryMiniLabelStyle: CSSProperties = {
  fontSize: "0.76rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
};

const summaryStatRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: "0.88rem",
  color: pageColorTokens.textBody,
};

const userCardStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.7rem",
  padding: "0.85rem 0.9rem",
  borderRadius: "14px",
  background: "rgba(255,255,255,0.78)",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
};

const userAvatarStyle: CSSProperties = {
  width: "34px",
  height: "34px",
  borderRadius: "999px",
  display: "grid",
  placeItems: "center",
  background: pageColorTokens.brandGreenLight,
  color: pageColorTokens.brandGreenDark,
  fontSize: "0.75rem",
  fontWeight: 700,
};

const userNameStyle: CSSProperties = {
  fontSize: "0.88rem",
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const userMetaStyle: CSSProperties = {
  fontSize: "0.74rem",
  color: pageColorTokens.textSecondary,
};

const contentColumnStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};

const surfaceCardStyle: CSSProperties = {
  padding: "1.25rem",
  borderRadius: "18px",
  background: "#ffffff",
  border: `1px solid ${pageColorTokens.border}`,
  boxShadow: pageColorTokens.shadowCard,
};

const sectionKickerStyle: CSSProperties = {
  fontSize: "0.78rem",
  fontWeight: 700,
  color: pageColorTokens.brandBlueDark,
  marginBottom: "0.35rem",
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "1.5rem",
  lineHeight: 1.25,
  color: pageColorTokens.textPrimary,
};

const sectionDescriptionStyle: CSSProperties = {
  margin: "0.55rem 0 0",
  fontSize: "0.94rem",
  lineHeight: 1.6,
  color: pageColorTokens.textSecondary,
  maxWidth: "42rem",
};

const sectionHeaderRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "1rem",
  marginBottom: "1rem",
};

const sectionCardTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "1.12rem",
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const sectionCardDescriptionStyle: CSSProperties = {
  margin: "0.35rem 0 0",
  fontSize: "0.85rem",
  color: pageColorTokens.textSecondary,
  lineHeight: 1.55,
};

const metricGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: "1rem",
};

const metricCardStyle: CSSProperties = {
  padding: "0.95rem 1rem",
  borderRadius: "16px",
  background: "#f8fafb",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
};

const metricValueStyle: CSSProperties = {
  marginTop: "0.25rem",
  fontSize: "1.7rem",
  lineHeight: 1.1,
  fontWeight: 800,
  color: pageColorTokens.textPrimary,
};

const metricNoteStyle: CSSProperties = {
  marginTop: "0.25rem",
  fontSize: "0.82rem",
  lineHeight: 1.45,
  color: pageColorTokens.textSecondary,
};

const dashboardGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 0.95fr)",
  gap: "1rem",
  alignItems: "start",
};

const dashboardSideColumnStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
};

const boardTaskCardStyle: CSSProperties = {
  padding: "1rem",
  borderRadius: "16px",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: "#fafbfc",
  display: "flex",
  flexDirection: "column",
  gap: "0.6rem",
};

const boardStatusPillStyle = (status: AutomationBoardItem["status"]): CSSProperties => {
  const config =
    status === "healthy"
      ? {
          color: pageColorTokens.brandGreenDark,
          background: pageColorTokens.brandGreenLight,
          border: "rgba(0,166,124,0.22)",
        }
      : status === "watch"
        ? {
            color: "#a55200",
            background: "#fff1e8",
            border: "rgba(192,87,23,0.22)",
          }
        : {
            color: pageColorTokens.criticalText,
            background: pageColorTokens.criticalBg,
            border: "rgba(220,38,38,0.22)",
          };
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "0.28rem 0.65rem",
    borderRadius: "999px",
    fontSize: "0.75rem",
    fontWeight: 700,
    color: config.color,
    background: config.background,
    border: `1px solid ${config.border}`,
  };
};

const tabRowStyle: CSSProperties = {
  display: "flex",
  gap: "0.55rem",
  flexWrap: "wrap",
};

const tabButtonStyle = (active: boolean): CSSProperties => ({
  padding: "0.55rem 0.85rem",
  borderRadius: "999px",
  border: `1px solid ${active ? "rgba(64,112,244,0.26)" : pageColorTokens.borderSubtle}`,
  background: active ? "rgba(64,112,244,0.08)" : "#f8f9fa",
  color: active ? pageColorTokens.brandBlueDark : pageColorTokens.textBody,
  fontSize: "0.84rem",
  fontWeight: 700,
  cursor: "pointer",
});

const cardGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  gap: "1rem",
};

const appCardStyle: CSSProperties = {
  padding: "1rem",
  borderRadius: "16px",
  border: `1px solid ${pageColorTokens.border}`,
  background: "#fff",
  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

const appCardHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "0.75rem",
};

const appBadgeStyle: CSSProperties = {
  width: "40px",
  height: "40px",
  borderRadius: "12px",
  display: "grid",
  placeItems: "center",
  background: "#f2f4f7",
  color: pageColorTokens.textPrimary,
  fontWeight: 800,
  fontSize: "0.78rem",
};

const modeBadgeStyle = (mode: WorkspaceAppMode): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  padding: "0.22rem 0.6rem",
  borderRadius: "999px",
  border: `1px solid ${mode === "route" ? "rgba(0,166,124,0.18)" : "rgba(64,112,244,0.18)"}`,
  background: mode === "route" ? "rgba(0,166,124,0.08)" : "rgba(64,112,244,0.08)",
  color: mode === "route" ? pageColorTokens.brandGreenDark : pageColorTokens.brandBlueDark,
  fontSize: "0.74rem",
  fontWeight: 700,
});

const appTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "1rem",
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const appDescriptionStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.84rem",
  lineHeight: 1.55,
  color: pageColorTokens.textSecondary,
};

const metaPanelStyle: CSSProperties = {
  padding: "0.75rem 0.8rem",
  borderRadius: "12px",
  background: "#f8fafb",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
};

const metaLabelStyle: CSSProperties = {
  fontSize: "0.72rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
  marginBottom: "0.2rem",
};

const metaValueStyle: CSSProperties = {
  fontSize: "0.84rem",
  color: pageColorTokens.textBody,
  lineHeight: 1.45,
};

const appSummaryStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.82rem",
  lineHeight: 1.5,
  color: pageColorTokens.textMuted,
};

const cardActionsStyle: CSSProperties = {
  display: "flex",
  gap: "0.65rem",
  flexWrap: "wrap",
  marginTop: "auto",
};

const primaryActionStyle: CSSProperties = {
  border: "none",
  borderRadius: "10px",
  padding: "0.68rem 0.95rem",
  background: pageColorTokens.brandGreen,
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryActionStyle: CSSProperties = {
  borderRadius: "10px",
  padding: "0.68rem 0.95rem",
  border: `1px solid ${pageColorTokens.border}`,
  background: "#fff",
  color: pageColorTokens.textBody,
  fontWeight: 700,
  cursor: "pointer",
};

const twoColumnPreviewStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(280px, 0.9fr) minmax(0, 1.4fr)",
  gap: "1rem",
};

const contextIntroCardStyle: CSSProperties = {
  padding: "1rem",
  borderRadius: "16px",
  background: "#f8fafb",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  display: "flex",
  flexDirection: "column",
  gap: "0.85rem",
};

const contextSectionTitleStyle: CSSProperties = {
  fontSize: "0.8rem",
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const contextBodyStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.88rem",
  lineHeight: 1.6,
  color: pageColorTokens.textSecondary,
};

const listStyle: CSSProperties = {
  margin: 0,
  paddingLeft: "1.1rem",
  color: pageColorTokens.textSecondary,
  fontSize: "0.85rem",
  lineHeight: 1.7,
};

const promptChipWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.45rem",
};

const promptChipStyle: CSSProperties = {
  padding: "0.48rem 0.7rem",
  borderRadius: "999px",
  background: "#fff",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: "0.8rem",
  color: pageColorTokens.textBody,
};

const conversationStageStyle: CSSProperties = {
  padding: "1rem",
  borderRadius: "16px",
  background: "#fcfcfd",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  display: "flex",
  flexDirection: "column",
  gap: "0.85rem",
};

const conversationBubbleStyle = (role: "assistant" | "user"): CSSProperties => ({
  maxWidth: "86%",
  alignSelf: role === "assistant" ? "flex-start" : "flex-end",
  padding: "0.85rem 0.95rem",
  borderRadius: "16px",
  background: role === "assistant" ? "#fff" : "rgba(64,112,244,0.08)",
  border: `1px solid ${role === "assistant" ? pageColorTokens.borderSubtle : "rgba(64,112,244,0.16)"}`,
});

const bubbleMetaStyle: CSSProperties = {
  fontSize: "0.72rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
  marginBottom: "0.35rem",
};

const bubbleContentStyle: CSSProperties = {
  fontSize: "0.88rem",
  lineHeight: 1.6,
  color: pageColorTokens.textBody,
};

const composerShellStyle: CSSProperties = {
  marginTop: "0.5rem",
  padding: "0.95rem",
  borderRadius: "14px",
  border: `1px solid ${pageColorTokens.border}`,
  background: "#fff",
};

const composerHintStyle: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
  marginBottom: "0.45rem",
};

const composerFieldStyle: CSSProperties = {
  minHeight: "84px",
  padding: "0.85rem",
  borderRadius: "12px",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: "#fafafa",
  fontSize: "0.9rem",
  color: pageColorTokens.textFootnote,
};

const composerActionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "0.75rem",
  marginTop: "0.8rem",
  flexWrap: "wrap",
};

const filterPanelStyle: CSSProperties = {
  display: "grid",
  gap: "0.9rem",
  marginBottom: "1rem",
};

const filterGroupStyle: CSSProperties = {
  display: "grid",
  gap: "0.45rem",
};

const filterLabelStyle: CSSProperties = {
  fontSize: "0.76rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
};

const listColumnStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.9rem",
};

const taskCardStyle: CSSProperties = {
  padding: "1rem",
  borderRadius: "16px",
  border: `1px solid ${pageColorTokens.border}`,
  background: "#fff",
  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
  display: "flex",
  flexDirection: "column",
  gap: "0.8rem",
};

const taskCardTopRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "1rem",
  alignItems: "flex-start",
};

const taskBadgeRowStyle: CSSProperties = {
  display: "flex",
  gap: "0.45rem",
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const taskIdStyle: CSSProperties = {
  fontSize: "0.72rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
};

const taskTitleStyle: CSSProperties = {
  margin: "0.2rem 0 0",
  fontSize: "1rem",
  color: pageColorTokens.textPrimary,
};

const taskSummaryStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.86rem",
  lineHeight: 1.55,
  color: pageColorTokens.textSecondary,
};

const taskMetaGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: "0.75rem",
};

const kindPillStyle = (kind: TaskKind): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  padding: "0.28rem 0.65rem",
  borderRadius: "999px",
  fontSize: "0.75rem",
  fontWeight: 700,
  color: kind === "automation" ? pageColorTokens.brandBlueDark : pageColorTokens.textBody,
  background: kind === "automation" ? "rgba(64,112,244,0.08)" : "#f3f4f6",
  border: `1px solid ${kind === "automation" ? "rgba(64,112,244,0.22)" : pageColorTokens.borderSubtle}`,
});

const statusPillStyle = (status: TaskStatus): CSSProperties => {
  const config =
    status === "running"
      ? { color: "#a55200", background: "#fff1e8", border: "rgba(192,87,23,0.22)" }
      : status === "review_required"
        ? { color: "#2952d8", background: "rgba(64,112,244,0.08)", border: "rgba(64,112,244,0.22)" }
        : status === "completed"
          ? { color: pageColorTokens.brandGreenDark, background: pageColorTokens.brandGreenLight, border: "rgba(0,166,124,0.22)" }
          : { color: pageColorTokens.criticalText, background: pageColorTokens.criticalBg, border: "rgba(220,38,38,0.22)" };
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "0.28rem 0.65rem",
    borderRadius: "999px",
    fontSize: "0.75rem",
    fontWeight: 700,
    color: config.color,
    background: config.background,
    border: `1px solid ${config.border}`,
  };
};

const chartWrapStyle: CSSProperties = {
  display: "grid",
  gap: "0.65rem",
};

const chartRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "50px minmax(0, 1fr) 56px",
  gap: "0.7rem",
  alignItems: "center",
};

const chartLabelStyle: CSSProperties = {
  fontSize: "0.78rem",
  color: pageColorTokens.textSecondary,
};

const chartTrackStyle: CSSProperties = {
  height: "10px",
  borderRadius: "999px",
  background: "#eef1f4",
  overflow: "hidden",
};

const chartBarStyle = (width: number, statusLabel?: string): CSSProperties => ({
  width: `${Math.max(width, 8)}%`,
  height: "100%",
  borderRadius: "999px",
  background:
    statusLabel === "健康"
      ? pageColorTokens.brandGreen
      : statusLabel === "关注"
        ? "#d97706"
        : statusLabel === "风险"
          ? pageColorTokens.critical
          : pageColorTokens.brandBlue,
});

const chartValueStyle: CSSProperties = {
  fontSize: "0.78rem",
  textAlign: "right",
  color: pageColorTokens.textBody,
};
