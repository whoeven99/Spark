/**
 * 工作台自动化 Panel（从 WorkspaceAppShellPage 拆出）。
 * 注意：当前列表为占位 mock 数据，待接入服务端 Playbook（见路线图阶段 4）。
 */
import { useResponsiveLayout } from "../../../hooks/useResponsiveLayout";
import type { AutomationView } from "./types";
import {
  automationCardStyle,
  buttonRowStyle,
  ghostButtonStyle,
  listColumnStyle,
  mobileAutomationCardStyle,
  mobileButtonRowStyle,
  mobileSectionHeaderStyle,
  mobileSurfaceCardStyle,
  mobileTabRowStyle,
  mutedMetaStyle,
  primaryButtonStyle,
  sectionHeaderStyle,
  sectionTextStyle,
  sectionTitleSmallStyle,
  sectionTitleStyle,
  statusBadgeStyle,
  surfaceCardStyle,
  tabButtonStyle,
  tabRowStyle,
} from "./styles";

type AutomationConfiguredItem = {
  id: string;
  title: string;
  schedule: string;
  lastRun: string;
  status: "healthy" | "attention";
  outcome: string;
};

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

export function AutomationPanel({
  activeView,
  onChangeView,
}: {
  activeView: AutomationView;
  onChangeView: (value: AutomationView) => void;
}) {
  const { isMobile } = useResponsiveLayout();
  const items =
    activeView === "configured"
      ? automationConfigured
      : activeView === "history"
        ? automationHistory
        : automationTemplates;

  return (
    <section style={isMobile ? mobileSurfaceCardStyle : surfaceCardStyle}>
      <div style={isMobile ? mobileSectionHeaderStyle : sectionHeaderStyle}>
        <div>
          <div style={sectionTitleStyle}>自动化任务</div>
          <div style={sectionTextStyle}>配置和管理可持续运行的任务流。</div>
        </div>
        <div style={isMobile ? mobileButtonRowStyle : buttonRowStyle}>
          <button type="button" style={ghostButtonStyle}>手动新建</button>
          <button type="button" className="workspace-primary-btn" style={primaryButtonStyle}>在对话中创建</button>
        </div>
      </div>

      <div style={isMobile ? mobileTabRowStyle : tabRowStyle}>
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
          <article key={item.id} style={isMobile ? mobileAutomationCardStyle : automationCardStyle}>
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
