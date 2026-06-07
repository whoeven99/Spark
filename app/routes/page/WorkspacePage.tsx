import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { LanguageSelector } from "../component/common/LanguageSelector";
import { pageColorTokens } from "./pageUiStyles";

type ContextToolKey = "objects" | "documents" | "dataSource" | "media" | "constraints";
type MessageRole = "assistant" | "user";
type TaskKind = "automation" | "one_off";
type TaskSource = "skill" | "chat" | "automation";
type TaskStatus = "draft" | "executing" | "completed" | "failed";

type ContextState = {
  selectedObjects: { type: string; count: number; source: string } | null;
  referenceDocuments: Array<{ name: string; note: string }>;
  dataSource: { name: string; rows: number; mappedFields: string[] } | null;
  mediaFiles: Array<{ name: string; kind: string }>;
  constraints: { maxLength: number; preserveHtml: boolean; tone: string } | null;
};

type ChatMessage = { id: string; role: MessageRole; content: string; timestamp: string };
type ConversationRecord = { id: string; title: string; updatedAt: string; summary: string; draftPrompt: string; messages: ChatMessage[] };
type ConfirmationTask = {
  id: string;
  title: string;
  description: string;
  objectCount: number;
  objectLabel: string;
  skillUsed: string[];
  estimation: { duration: string; credits: string; successRate: string };
  parameters: Array<{ label: string; value: string }>;
  preview: Array<{ before: string; after: string }>;
  status: TaskStatus;
};
type TaskItem = {
  id: string;
  title: string;
  kind: TaskKind;
  source: TaskSource;
  toolLabel: string;
  status: Exclude<TaskStatus, "draft">;
  updatedAt: string;
  summary: string;
  nextAction: string;
  progress: number;
};

const initialContext: ContextState = {
  selectedObjects: { type: "商品", count: 168, source: "2026 夏季新品集合" },
  referenceDocuments: [
    { name: "Brand Tone Guide", note: "专业、自然、避免夸张承诺" },
    { name: "SEO Keyword Sheet", note: "聚焦 summer dress / breathable fabric" },
  ],
  dataSource: { name: "summer-launch-products.csv", rows: 168, mappedFields: ["title", "bodyHtml", "tags", "material"] },
  mediaFiles: [{ name: "hero-shot-01.png", kind: "主图" }, { name: "campaign-moodboard.pdf", kind: "风格参考" }],
  constraints: { maxLength: 420, preserveHtml: true, tone: "SEO 专业" },
};

const conversations: ConversationRecord[] = [
  {
    id: "CONV-241001",
    title: "夏季新品文案工作台",
    updatedAt: "刚刚",
    summary: "围绕夏季新品批量文案优化的主会话。",
    draftPrompt: "帮我为这 168 个商品生成专业的商品描述，风格偏 SEO 优化，长度中等。",
    messages: [
      { id: "m1", role: "assistant", content: "我已经读取到一批夏季新品。你可以继续补充对象范围、参考资料和输出要求，我会整理成可执行任务。", timestamp: "09:12" },
      { id: "m2", role: "user", content: "对象范围就是夏季新品集合，想统一处理商品描述，保留 HTML 结构。", timestamp: "09:13" },
      { id: "m3", role: "assistant", content: "收到。我建议把对象、参考文档、数据源和约束都补齐后，直接生成任务确认卡片，避免反复澄清。", timestamp: "09:14" },
    ],
  },
  {
    id: "CONV-241000",
    title: "退款异常复盘",
    updatedAt: "18 分钟前",
    summary: "分析同一 SKU 退款异常，准备拆成自动化监控。",
    draftPrompt: "帮我继续分析退款异常订单，把可以自动监控的规则列出来。",
    messages: [
      { id: "r1", role: "assistant", content: "我已经定位到退款集中在同一 SKU，建议你补充订单来源和地区分布。", timestamp: "08:42" },
      { id: "r2", role: "user", content: "优先看美国站和最近 7 天的移动端订单。", timestamp: "08:44" },
    ],
  },
  {
    id: "CONV-240999",
    title: "多语言翻译批次",
    updatedAt: "1 小时前",
    summary: "翻译任务的历史会话。",
    draftPrompt: "继续这批商品的日语和英语翻译配置。",
    messages: [{ id: "t1", role: "assistant", content: "上一次已经确认目标语言为英语和日语，还缺品牌术语表。", timestamp: "07:21" }],
  },
];

const initialConfirmationTask: ConfirmationTask = {
  id: "TASK-241201",
  title: "批量生成商品描述",
  description: "基于已选商品、品牌规范和 CSV 数据，为夏季新品输出统一风格的商品描述草稿。",
  objectCount: 168,
  objectLabel: "商品",
  skillUsed: ["商品文案优化", "SEO 关键词规则", "品牌语气约束"],
  estimation: { duration: "6-8 分钟", credits: "约 420 credits", successRate: "92%" },
  parameters: [
    { label: "目标市场", value: "美国站" },
    { label: "语气", value: "专业、清晰、可搜索" },
    { label: "长度", value: "中等，约 280-420 字" },
    { label: "HTML", value: "保留原有结构" },
  ],
  preview: [
    { before: "Soft summer dress with floral pattern.", after: "Lightweight floral summer dress designed for breathable all-day wear and clearer search intent." },
    { before: "Comfortable fabric and elegant fit.", after: "Breathable fabric with a flattering silhouette, balancing comfort and polished seasonal styling." },
  ],
  status: "draft",
};

const initialTasks: TaskItem[] = [
  { id: "TASK-241198", title: "每日订单异常巡检", kind: "automation", source: "automation", toolLabel: "订单监控", status: "executing", updatedAt: "2 分钟前", summary: "正在扫描退款、超时履约和异常金额订单。", nextAction: "查看运行日志", progress: 64 },
  { id: "TASK-241190", title: "多语言商品翻译", kind: "one_off", source: "skill", toolLabel: "翻译", status: "executing", updatedAt: "11 分钟前", summary: "英语与日语翻译已过半，正在写回任务结果。", nextAction: "查看进度", progress: 51 },
  { id: "TASK-241177", title: "新品描述补齐", kind: "one_off", source: "chat", toolLabel: "AI 对话", status: "completed", updatedAt: "今天 09:03", summary: "已补齐 24 个新品的商品描述，可继续人工审核。", nextAction: "查看结果", progress: 100 },
  { id: "TASK-241160", title: "每日经营简报", kind: "automation", source: "automation", toolLabel: "店铺诊断", status: "completed", updatedAt: "今天 09:00", summary: "自动汇总 ROAS、转化率和退款波动，已推送到工作台。", nextAction: "打开简报", progress: 100 },
  { id: "TASK-241155", title: "异常订单重跑", kind: "automation", source: "automation", toolLabel: "订单监控", status: "failed", updatedAt: "昨天 19:04", summary: "重跑失败，原因是订单数据源响应超时。", nextAction: "重新执行", progress: 100 },
];

const toolbarItems: Array<{ key: ContextToolKey; label: string; hint: string }> = [
  { key: "objects", label: "选择对象", hint: "商品 / 订单 / 客户" },
  { key: "documents", label: "参考文档", hint: "规则 / SOP / 品牌资料" },
  { key: "dataSource", label: "数据源", hint: "CSV / 表格 / 映射" },
  { key: "media", label: "多媒体", hint: "图片 / PDF / 风格稿" },
  { key: "constraints", label: "约束条件", hint: "语气 / 长度 / 保留字段" },
];

const quickLaunchers = [
  { id: "copy", title: "商品文案优化", description: "直接进入电商文案生成场景", prompt: "帮我批量优化这批商品描述，优先突出 SEO 和转化。" },
  { id: "translation", title: "多语言翻译", description: "发起带上下文的翻译任务", prompt: "继续这批商品的英语和日语翻译，并保留品牌术语。" },
  { id: "diagnosis", title: "店铺诊断", description: "围绕经营异常继续对话", prompt: "帮我看最近 7 天经营指标异常，并给出优先级建议。" },
];

export function WorkspacePage() {
  const [activeConversationId, setActiveConversationId] = useState(conversations[0].id);
  const [activeTool, setActiveTool] = useState<ContextToolKey | null>("objects");
  const [context, setContext] = useState(initialContext);
  const [messages, setMessages] = useState(conversations[0].messages);
  const [confirmationTask, setConfirmationTask] = useState(initialConfirmationTask);
  const [tasks, setTasks] = useState(initialTasks);
  const [draftInput, setDraftInput] = useState(conversations[0].draftPrompt);

  const activeConversation = conversations.find((item) => item.id === activeConversationId) ?? conversations[0];
  const groupedTasks = useMemo(() => ({
    executing: tasks.filter((task) => task.status === "executing"),
    completed: tasks.filter((task) => task.status === "completed"),
    failed: tasks.filter((task) => task.status === "failed"),
  }), [tasks]);
  const taskOverview = useMemo(() => ({
    automation: tasks.filter((task) => task.kind === "automation").length,
    oneOff: tasks.filter((task) => task.kind === "one_off").length,
    failedTask: tasks.find((task) => task.status === "failed") ?? null,
  }), [tasks]);

  const selectConversation = (conversation: ConversationRecord) => {
    setActiveConversationId(conversation.id);
    setMessages(conversation.messages);
    setDraftInput(conversation.draftPrompt);
  };

  const clearContext = () => setContext({ selectedObjects: null, referenceDocuments: [], dataSource: null, mediaFiles: [], constraints: null });

  const applyPreset = (tool: ContextToolKey) => {
    setActiveTool(tool);
    if (tool === "documents") setContext((current) => ({ ...current, referenceDocuments: [...initialContext.referenceDocuments, { name: "US Market Fit Notes", note: "突出场景、尺码与透气性表达" }] }));
    if (tool === "dataSource") setContext((current) => ({ ...current, dataSource: { name: "summer-launch-products.csv", rows: 168, mappedFields: ["title", "bodyHtml", "tags", "material", "fit"] } }));
    if (tool === "media") setContext((current) => ({ ...current, mediaFiles: [...initialContext.mediaFiles, { name: "fabric-closeup.jpg", kind: "材质细节" }] }));
    if (tool === "constraints") setContext((current) => ({ ...current, constraints: { maxLength: 420, preserveHtml: true, tone: "SEO 专业" } }));
    if (tool === "objects") setContext((current) => ({ ...current, selectedObjects: initialContext.selectedObjects }));
  };

  const sendMessage = () => {
    const trimmed = draftInput.trim();
    if (!trimmed) return;
    setMessages((current) => [
      ...current,
      { id: `u-${current.length + 1}`, role: "user", content: trimmed, timestamp: "刚刚" },
      { id: `a-${current.length + 2}`, role: "assistant", content: "我会基于当前上下文整理任务范围，并把结果更新到确认卡片与右侧任务面板。", timestamp: "刚刚" },
    ]);
  };

  const launchPrompt = (prompt: string) => {
    setDraftInput(prompt);
    setMessages((current) => [
      ...current,
      { id: `p-${current.length + 1}`, role: "assistant", content: "已切换到快捷工具场景。你可以直接确认任务，或继续补充上下文。", timestamp: "刚刚" },
    ]);
  };

  const executeTask = () => {
    setConfirmationTask((current) => ({ ...current, status: "executing" }));
    setTasks((current) => current.some((task) => task.id === confirmationTask.id)
      ? current.map((task) => task.id === confirmationTask.id ? { ...task, status: "executing", updatedAt: "刚刚", progress: 12, summary: "已从确认卡片进入执行阶段，正在分批生成商品描述。", nextAction: "查看运行日志" } : task)
      : [{ id: confirmationTask.id, title: confirmationTask.title, kind: "one_off", source: "chat", toolLabel: "商品文案优化", status: "executing", updatedAt: "刚刚", summary: "已从确认卡片进入执行阶段，正在分批生成商品描述。", nextAction: "查看运行日志", progress: 12 }, ...current]);
  };

  return (
    <div style={shellStyle}>
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>Spark Workbench</div>
          <h1 style={titleStyle}>Chat Workbench</h1>
          <p style={subtitleStyle}>首页改成对话驱动的工作台：中央消息流承接上下文与任务确认，右侧统一展示执行中、已完成和失败任务。</p>
        </div>
        <div style={statsRowStyle}>{[
          ["执行中", groupedTasks.executing.length],
          ["已完成", groupedTasks.completed.length],
          ["失败", groupedTasks.failed.length],
        ].map(([label, value]) => <div key={label as string} style={statCardStyle}><span style={statLabelStyle}>{label}</span><strong>{value}</strong></div>)}</div>
      </div>

      <div style={layoutStyle}>
        <main style={mainStyle}>
          <section style={cardStyle}>
            <div style={sectionHeadStyle}><div><div style={sectionEyebrowStyle}>最近会话</div><h2 style={sectionTitleStyle}>对话记录</h2></div><span style={mutedStyle}>最多展示 50 条</span></div>
            <div style={conversationGridStyle}>{conversations.slice(0, 50).map((conversation) => <button key={conversation.id} type="button" style={conversationButtonStyle(conversation.id === activeConversationId)} onClick={() => selectConversation(conversation)}><span style={conversationTitleStyle}>{conversation.title}</span><span style={mutedStyle}>{conversation.updatedAt}</span></button>)}</div>
          </section>

          <section style={cardStyle}>
            <div style={sectionHeadStyle}><div><div style={sectionEyebrowStyle}>当前会话</div><h2 style={sectionTitleStyle}>{activeConversation.title}</h2><p style={sectionTextStyle}>{activeConversation.summary}</p></div><button type="button" style={secondaryButtonStyle} onClick={clearContext}>清空上下文</button></div>

            <div style={launcherSectionStyle}>
              <div style={sectionEyebrowStyle}>工具集合</div>
              <div style={launcherGridStyle}>
                {quickLaunchers.map((item) => (
                  <button key={item.id} type="button" style={launcherCardStyle} onClick={() => launchPrompt(item.prompt)}>
                    <strong style={launcherTitleStyle}>{item.title}</strong>
                    <span style={sectionTextStyle}>{item.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={messageListStyle}>{messages.map((message) => <MessageBubble key={message.id} message={message} />)}</div>

            <TaskConfirmationCard task={confirmationTask} onExecute={executeTask} onOpenRelatedTool={() => setActiveTool("constraints")} />

            <div style={pillWrapStyle}>{[
              context.selectedObjects ? `${context.selectedObjects.count} 个${context.selectedObjects.type}` : "未选对象",
              context.referenceDocuments.length ? `${context.referenceDocuments.length} 份参考文档` : "无参考文档",
              context.dataSource ? `${context.dataSource.rows} 行数据` : "无数据源",
              context.mediaFiles.length ? `${context.mediaFiles.length} 个多媒体` : "无多媒体",
              context.constraints ? `${context.constraints.tone} / ${context.constraints.maxLength} 字` : "无约束",
            ].map((item) => <span key={item} style={pillStyle}>{item}</span>)}</div>

            <div style={toolbarStyle}>
              <div style={sectionHeadStyle}><div><div style={sectionEyebrowStyle}>ToolBar</div><p style={sectionTextStyle}>用于补充对话里缺失的结构化上下文，而不是做页面导航。</p></div><button type="button" style={subtleButtonStyle} onClick={clearContext}>清空</button></div>
              <div style={toolbarGridStyle}>{toolbarItems.map((tool) => <button key={tool.key} type="button" style={toolbarButtonStyle(activeTool === tool.key)} onClick={() => setActiveTool(tool.key)}><strong style={toolbarLabelStyle}>{tool.label}</strong><span style={mutedStyle}>{tool.hint}</span><span style={toolbarCountStyle}>{formatToolCount(tool.key, context)}</span></button>)}</div>
            </div>

            <ToolbarContextPanel activeTool={activeTool} context={context} onApplyPreset={applyPreset} />

            <div style={composerStyle}>
              <div style={sectionEyebrowStyle}>继续补充任务目标</div>
              <textarea value={draftInput} onChange={(event) => setDraftInput(event.target.value)} style={textareaStyle} />
              <div style={composerFooterStyle}><span style={mutedStyle}>对象范围 + 参考资料 + 约束条件补齐后，更适合直接生成任务确认卡片。</span><button type="button" style={primaryButtonStyle} onClick={sendMessage}>更新对话</button></div>
            </div>
          </section>

          <LanguageSelector />
        </main>

        <aside style={asideStyle}>
          <section style={cardStyle}>
            <div style={sectionHeadStyle}><div><div style={sectionEyebrowStyle}>Task List Panel</div><h2 style={sectionTitleStyle}>统一任务列表</h2><p style={sectionTextStyle}>对话中的确认卡片与右侧任务面板状态同步，自动化任务和单次任务共用一个总表。</p></div></div>
            <div style={summaryGridStyle}>
              <InfoCell label="自动化任务" value={`${taskOverview.automation}`} />
              <InfoCell label="单次任务" value={`${taskOverview.oneOff}`} />
            </div>
            {taskOverview.failedTask ? (
              <div style={warningPanelStyle}>
                <div style={warningTitleStyle}>当前需要优先关注</div>
                <div style={warningBodyStyle}>{taskOverview.failedTask.title}：{taskOverview.failedTask.summary}</div>
              </div>
            ) : null}
            <TaskSection title="执行中" tasks={groupedTasks.executing} emptyText="暂无执行中的任务" />
            <TaskSection title="已完成" tasks={groupedTasks.completed} emptyText="暂无已完成任务" />
            <TaskSection title="失败" tasks={groupedTasks.failed} emptyText="暂无失败任务" />
          </section>
        </aside>
      </div>
    </div>
  );
}

function ToolbarContextPanel({ activeTool, context, onApplyPreset }: { activeTool: ContextToolKey | null; context: ContextState; onApplyPreset: (tool: ContextToolKey) => void }) {
  if (!activeTool) return null;
  const titleMap: Record<ContextToolKey, string> = { objects: "选择对象", documents: "参考文档", dataSource: "数据源", media: "多媒体", constraints: "约束条件" };
  const descriptionMap: Record<ContextToolKey, string> = {
    objects: "优先明确 AI 要处理的对象集合，减少后续追问。",
    documents: "把品牌规则、SOP 或风格指南直接挂到当前对话里。",
    dataSource: "声明 CSV、表格和字段映射，避免 AI 猜测字段结构。",
    media: "把图片、PDF 和风格参考一并交给对话，减少描述损耗。",
    constraints: "通过显式参数控制长度、语气和保留 HTML 等规则。",
  };

  const rows = activeTool === "objects"
    ? [["对象类型", context.selectedObjects?.type ?? "未选择"], ["对象数量", context.selectedObjects ? `${context.selectedObjects.count}` : "0"], ["来源", context.selectedObjects?.source ?? "未绑定"]]
    : activeTool === "documents"
      ? context.referenceDocuments.map((item) => [item.name, item.note])
      : activeTool === "dataSource"
        ? [["文件名", context.dataSource?.name ?? "未绑定"], ["行数", context.dataSource ? `${context.dataSource.rows}` : "0"], ["字段", context.dataSource?.mappedFields.join(", ") ?? "未映射"]]
        : activeTool === "media"
          ? context.mediaFiles.map((item) => [item.name, item.kind])
          : [["最大长度", context.constraints ? `${context.constraints.maxLength} 字` : "未设置"], ["保留 HTML", context.constraints ? (context.constraints.preserveHtml ? "是" : "否") : "未设置"], ["语气", context.constraints?.tone ?? "未设置"]];

  return (
    <div style={panelStyle}>
      <div style={sectionHeadStyle}><div><h3 style={sectionTitleStyle}>{titleMap[activeTool]}</h3><p style={sectionTextStyle}>{descriptionMap[activeTool]}</p></div><button type="button" style={secondaryButtonStyle} onClick={() => onApplyPreset(activeTool)}>应用预设</button></div>
      <div style={infoGridStyle}>{rows.map(([label, value]) => <InfoCell key={label} label={label} value={value} />)}</div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isAssistant = message.role === "assistant";
  return <div style={{ display: "flex", flexDirection: "column", alignItems: isAssistant ? "flex-start" : "flex-end", gap: "0.3rem" }}><div style={metaRowStyle}><span>{isAssistant ? "Assistant" : "You"}</span><span>{message.timestamp}</span></div><div style={messageBubbleStyle(isAssistant)}>{message.content}</div></div>;
}

function TaskConfirmationCard({ task, onExecute, onOpenRelatedTool }: { task: ConfirmationTask; onExecute: () => void; onOpenRelatedTool: () => void }) {
  return (
    <article style={confirmationStyle}>
      <div style={sectionHeadStyle}><div><div style={sectionEyebrowStyle}>Task Confirmation Card</div><h3 style={sectionTitleStyle}>{task.title}</h3><p style={sectionTextStyle}>{task.description}</p></div><span style={statusPillStyle(task.status)}>{formatTaskStatus(task.status)}</span></div>
      <div style={infoGridStyle}><InfoCell label="处理对象" value={`${task.objectCount} 个${task.objectLabel}`} /><InfoCell label="预计耗时" value={task.estimation.duration} /><InfoCell label="成功率" value={task.estimation.successRate} /></div>
      <div style={pillWrapStyle}>{task.skillUsed.map((skill) => <span key={skill} style={skillPillStyle}>{skill}</span>)}</div>
      <div style={twoColumnStyle}>
        <div style={panelStyle}><div style={sectionEyebrowStyle}>执行参数</div><div style={infoGridStyle}>{task.parameters.map((item) => <InfoCell key={item.label} label={item.label} value={item.value} />)}</div></div>
        <div style={panelStyle}><div style={sectionEyebrowStyle}>结果预览</div><div style={{ display: "grid", gap: "0.6rem" }}>{task.preview.map((item) => <div key={item.before} style={previewCardStyle}><strong style={previewLabelStyle}>Before</strong><div style={previewTextStyle}>{item.before}</div><strong style={previewLabelStyle}>After</strong><div style={previewTextStyle}>{item.after}</div></div>)}</div></div>
      </div>
      <div style={composerFooterStyle}><span style={mutedStyle}>预计消耗 {task.estimation.credits}</span><div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}><button type="button" style={secondaryButtonStyle} onClick={onOpenRelatedTool}>调整约束</button><button type="button" style={primaryButtonStyle} onClick={onExecute}>{task.status === "executing" ? "执行中" : "确认执行"}</button></div></div>
    </article>
  );
}

function TaskSection({ title, tasks, emptyText }: { title: string; tasks: TaskItem[]; emptyText: string }) {
  return <div style={{ display: "grid", gap: "0.75rem" }}><div style={taskSectionHeadStyle}><h3 style={taskSectionTitleStyle}>{title}</h3><span style={countStyle}>{tasks.length}</span></div>{tasks.length ? <div style={{ display: "grid", gap: "0.75rem" }}>{tasks.map((task) => <TaskCard key={task.id} task={task} />)}</div> : <div style={emptyStyle}>{emptyText}</div>}</div>;
}

function TaskCard({ task }: { task: TaskItem }) {
  return (
    <article style={taskCardStyle}>
      <div style={sectionHeadStyle}><div><div style={taskIdStyle}>{task.id}</div><h4 style={taskTitleStyle}>{task.title}</h4></div><div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", justifyContent: "flex-end" }}><span style={kindPillStyle(task.kind)}>{task.kind === "automation" ? "自动化" : "单次"}</span><span style={statusPillStyle(task.status)}>{formatTaskStatus(task.status)}</span></div></div>
      <p style={sectionTextStyle}>{task.summary}</p>
      <div style={metaRowStyle}><span>{formatTaskSource(task.source)}</span><span>{task.toolLabel}</span><span>{task.updatedAt}</span></div>
      <div style={progressTrackStyle}><div style={progressBarStyle(task.progress, task.status)} /></div>
      <div style={composerFooterStyle}><span style={mutedStyle}>进度 {task.progress}%</span><button type="button" style={subtleButtonStyle}>{task.nextAction}</button></div>
    </article>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return <div style={infoCellStyle}><div style={cellLabelStyle}>{label}</div><div style={cellValueStyle}>{value}</div></div>;
}

function formatToolCount(tool: ContextToolKey, context: ContextState) {
  if (tool === "objects") return context.selectedObjects ? `${context.selectedObjects.count}` : "0";
  if (tool === "documents") return `${context.referenceDocuments.length}`;
  if (tool === "dataSource") return context.dataSource ? `${context.dataSource.rows}` : "0";
  if (tool === "media") return `${context.mediaFiles.length}`;
  return context.constraints ? "1" : "0";
}

function formatTaskStatus(status: TaskStatus) {
  if (status === "draft") return "待确认";
  if (status === "executing") return "执行中";
  if (status === "completed") return "已完成";
  return "失败";
}

function formatTaskSource(source: TaskSource) {
  if (source === "skill") return "工具任务";
  if (source === "chat") return "对话触发";
  return "自动化";
}

const shellStyle: CSSProperties = { minHeight: "calc(100dvh - 48px)", padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem", background: "#f6f6f7" };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start", padding: "1.2rem 1.25rem", borderRadius: "18px", background: "#fff", border: `1px solid ${pageColorTokens.border}`, boxShadow: pageColorTokens.shadowCard };
const layoutStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) 360px", gap: "1rem", alignItems: "start" };
const mainStyle: CSSProperties = { minWidth: 0, display: "flex", flexDirection: "column", gap: "1rem" };
const asideStyle: CSSProperties = { minWidth: 0, position: "sticky", top: "1rem" };
const cardStyle: CSSProperties = { padding: "1.2rem", borderRadius: "18px", background: "#fff", border: `1px solid ${pageColorTokens.border}`, boxShadow: pageColorTokens.shadowCard };
const panelStyle: CSSProperties = { padding: "1rem", borderRadius: "16px", background: "#fff", border: `1px solid ${pageColorTokens.borderSubtle}`, display: "grid", gap: "0.85rem" };
const confirmationStyle: CSSProperties = { ...panelStyle, background: "#f9fbff", border: "1px solid rgba(64,112,244,0.18)", marginBottom: "1rem" };
const taskCardStyle: CSSProperties = { padding: "0.95rem", borderRadius: "14px", border: `1px solid ${pageColorTokens.borderSubtle}`, background: "#fafbfb", display: "grid", gap: "0.7rem" };
const toolbarStyle: CSSProperties = { padding: "1rem", borderRadius: "16px", background: "#f8fafb", border: `1px solid ${pageColorTokens.borderSubtle}`, display: "grid", gap: "0.85rem", marginBottom: "1rem" };
const composerStyle: CSSProperties = { padding: "1rem", borderRadius: "16px", background: "#fff", border: `1px solid ${pageColorTokens.borderSubtle}` };
const infoGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem" };
const twoColumnStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.85rem" };
const conversationGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" };
const toolbarGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem" };
const launcherGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" };
const messageListStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "0.85rem", marginBottom: "1rem" };
const pillWrapStyle: CSSProperties = { display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" };
const sectionHeadStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start", marginBottom: "1rem" };
const composerFooterStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" };
const statsRowStyle: CSSProperties = { display: "flex", gap: "0.75rem", flexWrap: "wrap" };
const summaryGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.75rem", marginBottom: "0.9rem" };
const statCardStyle: CSSProperties = { minWidth: "92px", padding: "0.85rem 0.95rem", borderRadius: "14px", border: `1px solid ${pageColorTokens.borderSubtle}`, background: "#fafbfb", display: "grid", gap: "0.15rem" };
const statLabelStyle: CSSProperties = { fontSize: "0.74rem", fontWeight: 700, color: pageColorTokens.textSecondary };
const eyebrowStyle: CSSProperties = { fontSize: "0.76rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: pageColorTokens.textSecondary };
const titleStyle: CSSProperties = { margin: "0.3rem 0 0", fontSize: "1.8rem", lineHeight: 1.15, color: pageColorTokens.textPrimary };
const subtitleStyle: CSSProperties = { margin: "0.5rem 0 0", maxWidth: "46rem", fontSize: "0.94rem", lineHeight: 1.6, color: pageColorTokens.textSecondary };
const sectionEyebrowStyle: CSSProperties = { fontSize: "0.76rem", fontWeight: 700, color: pageColorTokens.brandBlueDark, marginBottom: "0.25rem" };
const sectionTitleStyle: CSSProperties = { margin: 0, fontSize: "1.05rem", fontWeight: 700, color: pageColorTokens.textPrimary };
const sectionTextStyle: CSSProperties = { margin: "0.35rem 0 0", fontSize: "0.84rem", lineHeight: 1.55, color: pageColorTokens.textSecondary };
const mutedStyle: CSSProperties = { fontSize: "0.76rem", color: pageColorTokens.textSecondary };
const conversationTitleStyle: CSSProperties = { fontSize: "0.86rem", fontWeight: 700, color: pageColorTokens.textPrimary };
const conversationButtonStyle = (active: boolean): CSSProperties => ({ padding: "0.9rem", borderRadius: "14px", border: `1px solid ${active ? "rgba(64,112,244,0.24)" : pageColorTokens.borderSubtle}`, background: active ? "rgba(64,112,244,0.08)" : "#fafbfb", display: "grid", gap: "0.2rem", textAlign: "left", cursor: "pointer" });
const toolbarButtonStyle = (active: boolean): CSSProperties => ({ padding: "0.85rem", borderRadius: "14px", border: `1px solid ${active ? "rgba(64,112,244,0.24)" : pageColorTokens.borderSubtle}`, background: active ? "rgba(64,112,244,0.08)" : "#fff", display: "grid", gap: "0.2rem", textAlign: "left", cursor: "pointer" });
const launcherSectionStyle: CSSProperties = { marginBottom: "1rem", display: "grid", gap: "0.75rem" };
const launcherCardStyle: CSSProperties = { padding: "0.9rem", borderRadius: "14px", border: `1px solid ${pageColorTokens.borderSubtle}`, background: "#fafbfb", display: "grid", gap: "0.25rem", textAlign: "left", cursor: "pointer" };
const launcherTitleStyle: CSSProperties = { fontSize: "0.86rem", color: pageColorTokens.textPrimary };
const toolbarLabelStyle: CSSProperties = { fontSize: "0.82rem", color: pageColorTokens.textPrimary };
const toolbarCountStyle: CSSProperties = { marginTop: "0.2rem", fontSize: "0.82rem", fontWeight: 700, color: pageColorTokens.brandBlueDark };
const metaRowStyle: CSSProperties = { display: "flex", gap: "0.55rem", flexWrap: "wrap", fontSize: "0.74rem", color: pageColorTokens.textSecondary };
const textareaStyle: CSSProperties = { width: "100%", minHeight: "110px", resize: "vertical", padding: "0.85rem", borderRadius: "12px", border: `1px solid ${pageColorTokens.border}`, background: "#fafbfb", fontSize: "0.9rem", color: pageColorTokens.textBody, boxSizing: "border-box" };
const messageBubbleStyle = (assistant: boolean): CSSProperties => ({ maxWidth: "85%", padding: "0.9rem 1rem", borderRadius: "16px", background: assistant ? "#f8fafb" : "rgba(64,112,244,0.08)", border: `1px solid ${assistant ? pageColorTokens.borderSubtle : "rgba(64,112,244,0.18)"}`, color: pageColorTokens.textBody, lineHeight: 1.6, fontSize: "0.9rem" });
const infoCellStyle: CSSProperties = { padding: "0.85rem 0.9rem", borderRadius: "14px", background: "#fff", border: `1px solid ${pageColorTokens.borderSubtle}` };
const cellLabelStyle: CSSProperties = { fontSize: "0.72rem", fontWeight: 700, color: pageColorTokens.textSecondary, marginBottom: "0.25rem" };
const cellValueStyle: CSSProperties = { fontSize: "0.84rem", color: pageColorTokens.textBody, lineHeight: 1.5 };
const skillPillStyle: CSSProperties = { padding: "0.35rem 0.65rem", borderRadius: "999px", background: "rgba(64,112,244,0.08)", border: "1px solid rgba(64,112,244,0.16)", color: pageColorTokens.brandBlueDark, fontSize: "0.76rem", fontWeight: 700 };
const kindPillStyle = (kind: TaskKind): CSSProperties => ({ padding: "0.22rem 0.55rem", borderRadius: "999px", border: `1px solid ${kind === "automation" ? "rgba(64,112,244,0.18)" : pageColorTokens.borderSubtle}`, background: kind === "automation" ? "rgba(64,112,244,0.08)" : "#fff", color: kind === "automation" ? pageColorTokens.brandBlueDark : pageColorTokens.textBody, fontSize: "0.72rem", fontWeight: 700 });
const statusPillStyle = (status: TaskStatus): CSSProperties => ({ padding: "0.22rem 0.55rem", borderRadius: "999px", border: `1px solid ${status === "draft" ? "rgba(64,112,244,0.18)" : status === "executing" ? "rgba(192,87,23,0.22)" : status === "completed" ? "rgba(0,166,124,0.22)" : "rgba(220,38,38,0.22)"}`, background: status === "draft" ? "rgba(64,112,244,0.08)" : status === "executing" ? "#fff1e8" : status === "completed" ? pageColorTokens.brandGreenLight : pageColorTokens.criticalBg, color: status === "draft" ? pageColorTokens.brandBlueDark : status === "executing" ? "#a55200" : status === "completed" ? pageColorTokens.brandGreenDark : pageColorTokens.criticalText, fontSize: "0.72rem", fontWeight: 700 });
const taskSectionHeadStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center" };
const taskSectionTitleStyle: CSSProperties = { margin: 0, fontSize: "0.92rem", fontWeight: 700, color: pageColorTokens.textPrimary };
const countStyle: CSSProperties = { minWidth: "24px", height: "24px", borderRadius: "999px", background: "#f3f4f6", display: "grid", placeItems: "center", fontSize: "0.74rem", color: pageColorTokens.textBody };
const emptyStyle: CSSProperties = { padding: "0.9rem", borderRadius: "12px", border: `1px dashed ${pageColorTokens.border}`, background: "#fafbfb", fontSize: "0.8rem", color: pageColorTokens.textSecondary };
const taskIdStyle: CSSProperties = { fontSize: "0.7rem", fontWeight: 700, color: pageColorTokens.textSecondary };
const taskTitleStyle: CSSProperties = { margin: "0.2rem 0 0", fontSize: "0.92rem", fontWeight: 700, color: pageColorTokens.textPrimary };
const progressTrackStyle: CSSProperties = { height: "8px", borderRadius: "999px", background: "#e9ecef", overflow: "hidden" };
const progressBarStyle = (progress: number, status: TaskStatus): CSSProperties => ({ width: `${progress}%`, height: "100%", borderRadius: "999px", background: status === "failed" ? pageColorTokens.critical : status === "completed" ? pageColorTokens.brandGreen : "#d97706" });
const previewCardStyle: CSSProperties = { padding: "0.8rem", borderRadius: "12px", background: "#f8fafb", border: `1px solid ${pageColorTokens.borderSubtle}` };
const previewLabelStyle: CSSProperties = { display: "block", fontSize: "0.7rem", fontWeight: 700, color: pageColorTokens.textSecondary, marginBottom: "0.2rem" };
const previewTextStyle: CSSProperties = { fontSize: "0.82rem", lineHeight: 1.5, color: pageColorTokens.textBody, marginBottom: "0.4rem" };
const warningPanelStyle: CSSProperties = { padding: "0.9rem", borderRadius: "14px", background: pageColorTokens.criticalBg, border: "1px solid rgba(220,38,38,0.16)", display: "grid", gap: "0.25rem", marginBottom: "1rem" };
const warningTitleStyle: CSSProperties = { fontSize: "0.78rem", fontWeight: 700, color: pageColorTokens.criticalText };
const warningBodyStyle: CSSProperties = { fontSize: "0.82rem", lineHeight: 1.55, color: pageColorTokens.textBody };
const primaryButtonStyle: CSSProperties = { border: "none", borderRadius: "10px", padding: "0.68rem 0.95rem", background: pageColorTokens.brandGreen, color: "#fff", fontWeight: 700, cursor: "pointer" };
const secondaryButtonStyle: CSSProperties = { borderRadius: "10px", padding: "0.68rem 0.95rem", border: `1px solid ${pageColorTokens.border}`, background: "#fff", color: pageColorTokens.textBody, fontWeight: 700, cursor: "pointer" };
const subtleButtonStyle: CSSProperties = { borderRadius: "10px", padding: "0.5rem 0.8rem", border: `1px solid ${pageColorTokens.borderSubtle}`, background: "#fff", color: pageColorTokens.textBody, fontWeight: 700, cursor: "pointer" };
