import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { LanguageSelector } from "../component/common/LanguageSelector";
import { pageColorTokens } from "./pageUiStyles";

type WorkspacePanel = "skills" | "chat" | "automation" | "tasks";
type WorkspaceAppCategory =
  | "content"
  | "operations"
  | "analysis"
  | "image"
  | "monitoring"
  | "chat";
type WorkspaceAppMode = "route" | "chat";
type TaskStatus = "running" | "review_required" | "completed" | "failed";
type TaskSource = "skill" | "chat" | "automation";
type AutomationTab = "configured" | "history" | "templates";

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
  toolLabel: string;
  status: TaskStatus;
  summary: string;
  createdAt: string;
  updatedAt: string;
  nextAction: string;
};

type AutomationTemplate = {
  id: string;
  title: string;
  description: string;
  frequency: string;
  output: string;
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

const mockTasks: TaskRecord[] = [
  {
    id: "TASK-240601",
    title: "夏季连衣裙商品描述优化",
    source: "skill",
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
    toolLabel: "图片工作室",
    status: "completed",
    summary: "已生成 8 张主图的英文化版本，适合进入渠道投放或 A/B 测试。",
    createdAt: "昨天 14:18",
    updatedAt: "昨天 14:42",
    nextAction: "查看结果",
  },
];

const automationTemplates: AutomationTemplate[] = [
  {
    id: "daily-brief",
    title: "每日店铺简报",
    description: "每天汇总店铺关键经营指标和异常变化，适合晨会查看。",
    frequency: "每天 09:00",
    output: "简报摘要 + 建议动作",
  },
  {
    id: "weekly-content",
    title: "每周商品文案巡检",
    description: "筛选近期上新商品并提醒需要优化的标题和描述。",
    frequency: "每周一",
    output: "待优化商品清单",
  },
  {
    id: "refund-watch",
    title: "退款风险监控",
    description: "持续检查退款比例与异常订单，适合高频巡检。",
    frequency: "每天 16:00",
    output: "风险订单摘要",
  },
  {
    id: "translation-followup",
    title: "新品翻译跟进",
    description: "为新上架商品生成多语言待办，便于本地化团队处理。",
    frequency: "每周二、周五",
    output: "待翻译商品列表",
  },
];

const sidebarItems: Array<{ key: WorkspacePanel; label: string; hint: string }> = [
  { key: "skills", label: "技能", hint: "内置 app 入口" },
  { key: "chat", label: "对话", hint: "自由或上下文对话" },
  { key: "automation", label: "自动化", hint: "周期执行任务" },
  { key: "tasks", label: "任务列表", hint: "统一任务总表" },
];

const categoryLabels: Record<WorkspaceAppCategory | "all", string> = {
  all: "全部",
  content: "内容",
  operations: "运营",
  analysis: "分析",
  image: "图像",
  monitoring: "监控",
  chat: "对话",
};

const panelLabels: Record<WorkspacePanel, string> = {
  skills: "技能",
  chat: "对话",
  automation: "自动化",
  tasks: "任务列表",
};

export function WorkspacePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [category, setCategory] = useState<WorkspaceAppCategory | "all">("all");
  const [automationTab, setAutomationTab] = useState<AutomationTab>("templates");
  const [taskFilter, setTaskFilter] = useState<"all" | TaskStatus>("all");

  const panel = parsePanel(searchParams.get("panel"));
  const selectedAppId = searchParams.get("app");
  const selectedApp = workspaceApps.find((item) => item.id === selectedAppId) ?? null;

  const filteredApps = useMemo(() => {
    if (category === "all") return workspaceApps;
    return workspaceApps.filter((item) => item.category === category);
  }, [category]);

  const filteredTasks = useMemo(() => {
    if (taskFilter === "all") return mockTasks;
    return mockTasks.filter((item) => item.status === taskFilter);
  }, [taskFilter]);

  const runningCount = mockTasks.filter((item) => item.status === "running").length;
  const pendingCount = mockTasks.filter((item) => item.status === "review_required").length;

  const setPanel = (nextPanel: WorkspacePanel, nextAppId?: string) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("panel", nextPanel);
    if (nextAppId) {
      nextParams.set("app", nextAppId);
    } else {
      nextParams.delete("app");
    }
    setSearchParams(nextParams);
  };

  const openApp = (app: WorkspaceApp) => {
    if (app.mode === "route" && app.route) {
      navigate(app.route);
      return;
    }
    setPanel("chat", app.id);
  };

  const openContextChat = (app: WorkspaceApp) => {
    setPanel("chat", app.id);
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
          <div style={summaryMiniLabelStyle}>当前工作概览</div>
          <div style={summaryStatRowStyle}>
            <span>运行中任务</span>
            <strong>{runningCount}</strong>
          </div>
          <div style={summaryStatRowStyle}>
            <span>待处理任务</span>
            <strong>{pendingCount}</strong>
          </div>
          <button type="button" style={sidebarLinkButtonStyle} onClick={() => setPanel("tasks")}>
            查看统一任务列表
          </button>
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
              {panel === "skills"
                ? "选择一个 Spark 内置 app，直接开始完成电商任务。"
                : panel === "chat"
                  ? "对话页用于承接技能上下文，也支持自由探索与继续已有工作。"
                  : panel === "automation"
                    ? "把高频任务沉淀为自动化，按时间和目标持续运行。"
                    : "统一查看技能、对话和自动化产生的任务结果与状态。"}
            </p>
          </div>
          <div style={headerActionsStyle}>
            <button type="button" style={secondaryActionStyle} onClick={() => setPanel("chat")}>
              自由对话
            </button>
            <button type="button" style={primaryActionStyle} onClick={() => setPanel("skills")}>
              返回技能首页
            </button>
          </div>
        </div>

        {panel === "skills" ? (
          <SkillsPanel
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
            onBackToSkills={() => setPanel("skills")}
            onOpenApp={openApp}
            onOpenTaskList={() => setPanel("tasks")}
          />
        ) : null}

        {panel === "automation" ? (
          <AutomationPanel
            automationTab={automationTab}
            onTabChange={setAutomationTab}
            onOpenTaskList={() => setPanel("tasks")}
          />
        ) : null}

        {panel === "tasks" ? (
          <TasksPanel
            taskFilter={taskFilter}
            tasks={filteredTasks}
            onFilterChange={setTaskFilter}
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

function SkillsPanel({
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
      <section style={heroSurfaceStyle}>
        <div style={heroGridStyle}>
          <div>
            <div style={sectionKickerStyle}>默认首页</div>
            <h2 style={sectionTitleStyle}>把现有 tools 作为内置 apps 放出来</h2>
            <p style={sectionDescriptionStyle}>
              首页不再默认进入聊天，而是先展示 Spark 已有的工作入口。用户先选择要完成的任务，再进入对应工具页或带上下文的对话。
            </p>
          </div>
          <div style={heroMetricsGridStyle}>
            <MetricCard label="内置 apps" value={String(workspaceApps.length)} note="第一版直接复用现有 tools" />
            <MetricCard label="推荐入口" value="4" note="优先放高频、高确定性任务" />
            <MetricCard label="统一任务心智" value="1" note="各 tool 任务列表汇总到一个总表" />
          </div>
        </div>
      </section>

      <section style={surfaceCardStyle}>
        <div style={sectionHeaderRowStyle}>
          <div>
            <h3 style={sectionCardTitleStyle}>分类</h3>
            <p style={sectionCardDescriptionStyle}>按电商工作场景快速浏览内置 app。</p>
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
            <h3 style={sectionCardTitleStyle}>推荐 Apps</h3>
            <p style={sectionCardDescriptionStyle}>优先展示最能体现 Spark 价值的任务入口。</p>
          </div>
        </div>
        <div style={cardGridStyle}>
          {workspaceApps.slice(0, 4).map((app) => (
            <AppCard
              key={app.id}
              app={app}
              onOpenApp={onOpenApp}
              onOpenContextChat={onOpenContextChat}
            />
          ))}
        </div>
      </section>

      <section style={surfaceCardStyle}>
        <div style={sectionHeaderRowStyle}>
          <div>
            <h3 style={sectionCardTitleStyle}>全部 Apps</h3>
            <p style={sectionCardDescriptionStyle}>
              当前分类：{categoryLabels[category]}。成熟工具优先进入已有页面，轻量任务优先进入上下文对话。
            </p>
          </div>
        </div>
        <div style={cardGridStyle}>
          {apps.map((app) => (
            <AppCard
              key={app.id}
              app={app}
              onOpenApp={onOpenApp}
              onOpenContextChat={onOpenContextChat}
            />
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
          {app.mode === "route" ? "打开 app" : "开始对话"}
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
  onBackToSkills,
  onOpenApp,
  onOpenTaskList,
}: {
  app: WorkspaceApp | null;
  onBackToSkills: () => void;
  onOpenApp: (app: WorkspaceApp) => void;
  onOpenTaskList: () => void;
}) {
  const displayApp = app ?? workspaceApps[0];

  return (
    <div style={contentColumnStyle}>
      <section style={surfaceCardStyle}>
        <div style={sectionHeaderRowStyle}>
          <div>
            <div style={sectionKickerStyle}>技能上下文对话</div>
            <h3 style={sectionCardTitleStyle}>{displayApp.title}</h3>
            <p style={sectionCardDescriptionStyle}>{displayApp.description}</p>
          </div>
          <div style={headerActionsStyle}>
            <button type="button" style={secondaryActionStyle} onClick={onBackToSkills}>
              返回技能页
            </button>
            {displayApp.mode === "route" ? (
              <button type="button" style={primaryActionStyle} onClick={() => onOpenApp(displayApp)}>
                打开真实工具页
              </button>
            ) : null}
          </div>
        </div>

        <div style={twoColumnPreviewStyle}>
          <div style={contextIntroCardStyle}>
            <div style={contextSectionTitleStyle}>当前任务目标</div>
            <p style={contextBodyStyle}>{displayApp.summary}</p>
            <div style={contextSectionTitleStyle}>建议输入</div>
            <ul style={listStyle}>
              {displayApp.inputHints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
            <div style={contextSectionTitleStyle}>推荐起手问题</div>
            <div style={promptChipWrapStyle}>
              {displayApp.starterPrompts.map((prompt) => (
                <span key={prompt} style={promptChipStyle}>
                  {prompt}
                </span>
              ))}
            </div>
          </div>

          <div style={conversationStageStyle}>
            <div style={conversationBubbleStyle("assistant")}>
              <div style={bubbleMetaStyle}>Assistant</div>
              <div style={bubbleContentStyle}>
                我已经进入“{displayApp.title}”的上下文模式。你可以直接输入任务目标、对象范围和预期结果，我会基于这个场景继续推进。
              </div>
            </div>
            <div style={conversationBubbleStyle("user")}>
              <div style={bubbleMetaStyle}>You</div>
              <div style={bubbleContentStyle}>{displayApp.starterPrompts[0]}</div>
            </div>
            <div style={conversationBubbleStyle("assistant")}>
              <div style={bubbleMetaStyle}>Assistant</div>
              <div style={bubbleContentStyle}>
                好的，我会先按“{displayApp.scenario}”的目标理解任务，并在有需要时给出结构化建议、结果草稿或下一步动作。
              </div>
            </div>

            <div style={composerShellStyle}>
              <div style={composerHintStyle}>上下文对话输入框</div>
              <div style={composerFieldStyle}>
                {displayApp.inputHints.join(" / ")}
              </div>
              <div style={composerActionsStyle}>
                <button type="button" style={secondaryActionStyle} onClick={onOpenTaskList}>
                  查看任务列表
                </button>
                <button type="button" style={primaryActionStyle}>
                  开始执行
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function AutomationPanel({
  automationTab,
  onTabChange,
  onOpenTaskList,
}: {
  automationTab: AutomationTab;
  onTabChange: (tab: AutomationTab) => void;
  onOpenTaskList: () => void;
}) {
  return (
    <div style={contentColumnStyle}>
      <section style={surfaceCardStyle}>
        <div style={sectionHeaderRowStyle}>
          <div>
            <div style={sectionKickerStyle}>自动化工作模式</div>
            <h3 style={sectionCardTitleStyle}>先用前端结构验证自动化的页面层级</h3>
            <p style={sectionCardDescriptionStyle}>
              第一版不接真实调度系统，只把“任务模板 / 已配置 / 执行历史”的入口关系和卡片形态先搭出来。
            </p>
          </div>
          <button type="button" style={secondaryActionStyle} onClick={onOpenTaskList}>
            查看全部任务结果
          </button>
        </div>

        <div style={tabRowStyle}>
          {[
            ["configured", "已配置"],
            ["history", "执行历史"],
            ["templates", "任务模板"],
          ].map(([value, label]) => {
            const active = automationTab === value;
            return (
              <button
                key={value}
                type="button"
                style={tabButtonStyle(active)}
                onClick={() => onTabChange(value as AutomationTab)}
              >
                {label}
              </button>
            );
          })}
        </div>

        {automationTab === "templates" ? (
          <div style={cardGridStyle}>
            {automationTemplates.map((template) => (
              <article key={template.id} style={appCardStyle}>
                <div style={appCardHeaderStyle}>
                  <div style={appBadgeStyle}>AU</div>
                  <span style={modeBadgeStyle("chat")}>模板</span>
                </div>
                <h4 style={appTitleStyle}>{template.title}</h4>
                <p style={appDescriptionStyle}>{template.description}</p>
                <div style={metaPanelStyle}>
                  <div style={metaLabelStyle}>执行频率</div>
                  <div style={metaValueStyle}>{template.frequency}</div>
                </div>
                <div style={metaPanelStyle}>
                  <div style={metaLabelStyle}>输出结果</div>
                  <div style={metaValueStyle}>{template.output}</div>
                </div>
                <div style={cardActionsStyle}>
                  <button type="button" style={primaryActionStyle}>
                    创建自动化
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {automationTab === "configured" ? (
          <div style={listColumnStyle}>
            {[
              "每日店铺简报 · 已启用 · 每天 09:00",
              "退款风险监控 · 已启用 · 每天下午 16:00",
            ].map((item) => (
              <div key={item} style={listRowStyle}>
                <div>
                  <div style={listRowTitleStyle}>{item}</div>
                  <div style={listRowMetaStyle}>第一版使用 mock 数据展示配置结构与状态文案。</div>
                </div>
                <button type="button" style={secondaryActionStyle}>
                  管理
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {automationTab === "history" ? (
          <div style={listColumnStyle}>
            {[
              "今天 09:00 · 每日店铺简报 · 已完成",
              "昨天 16:00 · 退款风险监控 · 失败，建议重试",
            ].map((item) => (
              <div key={item} style={listRowStyle}>
                <div>
                  <div style={listRowTitleStyle}>{item}</div>
                  <div style={listRowMetaStyle}>后续会汇总进统一任务列表，这里只保留自动化上下文视图。</div>
                </div>
                <button type="button" style={secondaryActionStyle}>
                  查看
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function TasksPanel({
  taskFilter,
  tasks,
  onFilterChange,
  onOpenChat,
}: {
  taskFilter: "all" | TaskStatus;
  tasks: TaskRecord[];
  onFilterChange: (filter: "all" | TaskStatus) => void;
  onOpenChat: () => void;
}) {
  return (
    <div style={contentColumnStyle}>
      <section style={surfaceCardStyle}>
        <div style={sectionHeaderRowStyle}>
          <div>
            <div style={sectionKickerStyle}>统一任务总表</div>
            <h3 style={sectionCardTitleStyle}>每个 tool 的任务列表都归到这里</h3>
            <p style={sectionCardDescriptionStyle}>
              首页任务列表展示总任务池；各 tool 页面中的任务区域后续只作为这个总表的筛选视图。
            </p>
          </div>
          <button type="button" style={secondaryActionStyle} onClick={onOpenChat}>
            继续对话
          </button>
        </div>

        <div style={tabRowStyle}>
          {[
            ["all", "全部"],
            ["running", "进行中"],
            ["review_required", "待处理"],
            ["completed", "已完成"],
            ["failed", "失败"],
          ].map(([value, label]) => {
            const active = taskFilter === value;
            return (
              <button
                key={value}
                type="button"
                style={tabButtonStyle(active)}
                onClick={() => onFilterChange(value as "all" | TaskStatus)}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div style={listColumnStyle}>
          {tasks.map((task) => (
            <article key={task.id} style={taskCardStyle}>
              <div style={taskCardTopRowStyle}>
                <div>
                  <div style={taskIdStyle}>{task.id}</div>
                  <h4 style={taskTitleStyle}>{task.title}</h4>
                </div>
                <span style={statusPillStyle(task.status)}>{formatTaskStatus(task.status)}</span>
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
                <button type="button" style={primaryActionStyle}>
                  {task.nextAction}
                </button>
                <button type="button" style={secondaryActionStyle}>
                  查看详情
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div style={metricCardStyle}>
      <div style={summaryMiniLabelStyle}>{label}</div>
      <div style={metricValueStyle}>{value}</div>
      <div style={metricNoteStyle}>{note}</div>
    </div>
  );
}

function parsePanel(rawPanel: string | null): WorkspacePanel {
  if (rawPanel === "chat" || rawPanel === "automation" || rawPanel === "tasks") {
    return rawPanel;
  }
  return "skills";
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
      return "技能";
    case "chat":
      return "对话";
    case "automation":
      return "自动化";
  }
}

const workspaceShellStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "236px minmax(0, 1fr)",
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

const sidebarLinkButtonStyle: CSSProperties = {
  marginTop: "0.35rem",
  border: "none",
  background: "transparent",
  padding: 0,
  color: pageColorTokens.brandBlueDark,
  fontWeight: 700,
  cursor: "pointer",
  textAlign: "left",
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

const heroSurfaceStyle: CSSProperties = {
  ...surfaceCardStyle,
  background: "linear-gradient(140deg, #ffffff 0%, #fbfcff 100%)",
};

const heroGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 0.9fr)",
  gap: "1rem",
  alignItems: "stretch",
};

const heroMetricsGridStyle: CSSProperties = {
  display: "grid",
  gap: "0.8rem",
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

const modeBadgeStyle = (mode: WorkspaceAppMode | "chat"): CSSProperties => ({
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

const listColumnStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.9rem",
};

const listRowStyle: CSSProperties = {
  padding: "0.95rem 1rem",
  borderRadius: "14px",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: "#fafbfc",
  display: "flex",
  justifyContent: "space-between",
  gap: "1rem",
  alignItems: "center",
};

const listRowTitleStyle: CSSProperties = {
  fontSize: "0.9rem",
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const listRowMetaStyle: CSSProperties = {
  fontSize: "0.8rem",
  color: pageColorTokens.textSecondary,
  marginTop: "0.25rem",
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
  fontSize: "0.86rem",
  lineHeight: 1.55,
  color: pageColorTokens.textSecondary,
};

const taskMetaGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: "0.75rem",
};

const statusPillStyle = (status: TaskStatus): CSSProperties => {
  const config =
    status === "running"
      ? {
          color: "#a55200",
          background: "#fff1e8",
          border: "rgba(192,87,23,0.22)",
        }
      : status === "review_required"
        ? {
            color: "#2952d8",
            background: "rgba(64,112,244,0.08)",
            border: "rgba(64,112,244,0.22)",
          }
        : status === "completed"
          ? {
              color: pageColorTokens.brandGreenDark,
              background: pageColorTokens.brandGreenLight,
              border: "rgba(0,166,124,0.22)",
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
