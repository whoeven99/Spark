/** 工作台首页 Panel — 轻量入口与经营摘要，完整指标见经营看板。 */
import { useResponsiveLayout } from "../../../hooks/useResponsiveLayout";
import type { WorkspaceDashboardSnapshot } from "../../../lib/workspaceDashboardTypes";
import {
  alertItemStyle,
  alertListStyle,
  ghostButtonStyle,
  listColumnStyle,
  metricDeltaStyle,
  metricGridStyle,
  metricLabelStyle,
  metricValueStyle,
  mobileMetricGridStyle,
  mobileSectionHeaderStyle,
  mobileSkillGridStyle,
  mobileSurfaceCardStyle,
  mobileTwoColumnStyle,
  mutedMetaStyle,
  panelStackStyle,
  primaryButtonStyle,
  sectionHeaderStyle,
  sectionTextStyle,
  sectionTitleSmallStyle,
  sectionTitleStyle,
  skillCardButtonStyle,
  skillCategoryStyle,
  skillFooterStyle,
  statusBadgeStyle,
  summaryItemStyle,
  surfaceCardStyle,
  textButtonStyle,
  twoColumnStyle,
} from "./styles";

type QuickLauncher = {
  id: string;
  category: string;
  title: string;
  description: string;
  prompt: string;
  path?: string;
  statusTone?: "positive" | "warning" | "neutral";
};

const quickLaunchers: QuickLauncher[] = [
  {
    id: "copy",
    category: "内容",
    title: "商品文案优化",
    description: "批量生成和优化商品标题、卖点与描述。",
    prompt: "帮我批量优化这批商品描述，优先突出 SEO 和转化。",
    path: "/app/product-improve",
    statusTone: "positive",
  },
  {
    id: "translation",
    category: "翻译",
    title: "多语言翻译",
    description: "发起带上下文的翻译任务，保留术语与结构。",
    prompt: "继续这批商品的英语和日语翻译，并保留品牌术语。",
    path: "/app/translation",
    statusTone: "positive",
  },
  {
    id: "daily",
    category: "分析",
    title: "每日经营待办",
    description: "每日巡检经营数据，按优先级生成可执行任务。",
    prompt: "帮我看最近 7 天经营指标异常，并给出优先级建议。",
    path: "/app/daily-operations",
    statusTone: "positive",
  },
  {
    id: "image",
    category: "视觉",
    title: "图片工具",
    description: "商品图翻译、文生图和素材优化。",
    prompt: "帮我处理这批商品主图的翻译与优化。",
    path: "/app/image-studio",
    statusTone: "positive",
  },
];

export function HomePanel({
  snapshot,
  onNewChat,
  onOpenDashboard,
  onOpenDailyOps,
  onOpenTasks,
  onOpenSkills,
  onQuickStart,
  onOpenTool,
}: {
  snapshot: WorkspaceDashboardSnapshot;
  onNewChat: () => void;
  onOpenDashboard: () => void;
  onOpenDailyOps: () => void;
  onOpenTasks: () => void;
  onOpenSkills: () => void;
  onQuickStart: (prompt: string) => void;
  onOpenTool: (path: string) => void;
}) {
  const { isMobile } = useResponsiveLayout();
  const topMetrics = snapshot.metrics.slice(0, 3);
  const topAlerts = snapshot.alerts.slice(0, 3);
  const recentTasks = snapshot.recentTaskSummaries.slice(0, 3);

  return (
    <div style={panelStackStyle}>
      <section style={isMobile ? mobileSurfaceCardStyle : surfaceCardStyle}>
        <div style={isMobile ? mobileSectionHeaderStyle : sectionHeaderStyle}>
          <div>
            <div style={{ ...sectionTitleStyle, fontSize: 20 }}>首页</div>
            <div style={{ ...sectionTextStyle, marginTop: 6, maxWidth: 640 }}>
              从这里快速开始对话、进入常用工具，或查看今日经营摘要。完整指标与趋势请前往经营看板。
            </div>
          </div>
          <button type="button" style={primaryButtonStyle} onClick={onNewChat}>
            新建对话
          </button>
        </div>
      </section>

      <section style={isMobile ? mobileSurfaceCardStyle : surfaceCardStyle}>
        <div style={isMobile ? mobileSectionHeaderStyle : sectionHeaderStyle}>
          <div>
            <div style={sectionTitleStyle}>快速开始</div>
            <div style={sectionTextStyle}>常用场景一键进入，或在对话中继续细化任务。</div>
          </div>
          <button type="button" style={ghostButtonStyle} onClick={onOpenSkills}>
            全部工具
          </button>
        </div>
        <div style={isMobile ? mobileSkillGridStyle : { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
          {quickLaunchers.map((item) => (
            <button
              key={item.id}
              type="button"
              style={skillCardButtonStyle}
              onClick={() => {
                if (item.path) onOpenTool(item.path);
                else onQuickStart(item.prompt);
              }}
            >
              <div style={skillCategoryStyle}>{item.category}</div>
              <div style={sectionTitleSmallStyle}>{item.title}</div>
              <div style={sectionTextStyle}>{item.description}</div>
              <div style={skillFooterStyle}>
                <span style={statusBadgeStyle(item.statusTone ?? "neutral")}>推荐</span>
                <span style={textButtonStyle}>进入</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <div style={isMobile ? mobileTwoColumnStyle : twoColumnStyle}>
        <section style={isMobile ? mobileSurfaceCardStyle : surfaceCardStyle}>
          <div style={isMobile ? mobileSectionHeaderStyle : sectionHeaderStyle}>
            <div>
              <div style={sectionTitleStyle}>经营摘要</div>
              <div style={sectionTextStyle}>首页只保留最关键指标，详细对比见经营看板。</div>
            </div>
            <button type="button" style={ghostButtonStyle} onClick={onOpenDashboard}>
              经营看板
            </button>
          </div>
          {topMetrics.length > 0 ? (
            <div style={isMobile ? mobileMetricGridStyle : { ...metricGridStyle, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
              {topMetrics.map((metric) => (
                <article key={metric.label} style={{ ...surfaceCardStyle, padding: 14, boxShadow: "none", border: "1px solid #e1e3e5" }}>
                  <div style={metricLabelStyle}>{metric.label}</div>
                  <div style={{ ...metricValueStyle, fontSize: 22 }}>{metric.value}</div>
                  <div style={metricDeltaStyle(metric.tone)}>{metric.delta}</div>
                </article>
              ))}
            </div>
          ) : (
            <div style={sectionTextStyle}>
              {snapshot.emptyMessage ?? "暂无经营快照，可前往每日经营待办生成今日摘要。"}
            </div>
          )}
          {snapshot.automation ? (
            <div style={{ ...summaryItemStyle, marginTop: 12 }}>
              <div style={sectionTitleSmallStyle}>{snapshot.automation.title}</div>
              <div style={sectionTextStyle}>{snapshot.automation.detail}</div>
              {snapshot.automation.lastRunAt ? (
                <div style={mutedMetaStyle}>
                  最近执行：{new Date(snapshot.automation.lastRunAt).toLocaleString("zh-CN", { hour12: false })}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section style={isMobile ? mobileSurfaceCardStyle : surfaceCardStyle}>
          <div style={isMobile ? mobileSectionHeaderStyle : sectionHeaderStyle}>
            <div>
              <div style={sectionTitleStyle}>今日关注</div>
              <div style={sectionTextStyle}>优先处理影响销售、库存和退款的核心问题。</div>
            </div>
            <button type="button" style={ghostButtonStyle} onClick={onOpenDailyOps}>
              每日待办
            </button>
          </div>
          <div style={alertListStyle}>
            {topAlerts.length === 0 ? (
              <div style={sectionTextStyle}>暂无需要优先处理的风险项。</div>
            ) : (
              topAlerts.map((alert) => (
                <div key={`${alert.title}-${alert.detail}`} style={alertItemStyle(alert.tone)}>
                  <div style={sectionTitleSmallStyle}>{alert.title}</div>
                  <div style={sectionTextStyle}>{alert.detail}</div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section style={isMobile ? mobileSurfaceCardStyle : surfaceCardStyle}>
        <div style={isMobile ? mobileSectionHeaderStyle : sectionHeaderStyle}>
          <div>
            <div style={sectionTitleStyle}>最近任务</div>
            <div style={sectionTextStyle}>自动化与单次任务的最新执行记录。</div>
          </div>
          <button type="button" style={ghostButtonStyle} onClick={onOpenTasks}>
            任务列表
          </button>
        </div>
        <div style={listColumnStyle}>
          {recentTasks.length === 0 ? (
            <div style={sectionTextStyle}>暂无近期任务，可从上方快速开始或新建对话。</div>
          ) : (
            recentTasks.map((item) => (
              <div key={item.id} style={summaryItemStyle}>
                <div style={sectionTitleSmallStyle}>{item.title}</div>
                <div style={sectionTextStyle}>{item.result}</div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
