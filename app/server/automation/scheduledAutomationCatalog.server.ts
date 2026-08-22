import type { ScheduledAutomationTaskView } from "../../lib/unifiedTaskTypes";

type ScheduledAutomationSeed = Omit<
  ScheduledAutomationTaskView,
  "createdAt" | "updatedAt"
>;

const SCHEDULED_AUTOMATION_CREATED_AT = "2026-08-20T00:00:00.000Z";

const SCHEDULED_AUTOMATION_SEEDS: ScheduledAutomationSeed[] = [
  {
    id: "sched-0800-briefing",
    title: "每日数据简报",
    summary: "偏事实摘要，只给关键数字、变化、异常波动，不做太多推理。",
    schedule: "每天 08:00",
    ownerRoles: ["老板", "运营负责人"],
    defaultQuestion: "昨天和近 7 天发生了什么",
    outputs: ["收入与订单", "流量变化", "广告花费", "库存异常"],
    enabled: true,
    sortOrder: 1,
  },
  {
    id: "sched-0815-insight",
    title: "每日经营洞察",
    summary: "偏判断，把数据、规则和基准比较收敛成 1-3 条最重要洞察，并给出动作建议。",
    schedule: "每天 08:15",
    ownerRoles: ["经营负责人"],
    defaultQuestion: "今天最重要的问题是什么",
    outputs: ["核心问题判断", "关键证据", "解决动作", "可进入任务建议"],
    enabled: true,
    sortOrder: 2,
  },
  {
    id: "sched-0830-health",
    title: "每日健康度监测",
    summary: "偏巡检，把站点健康度和经营健康度的异常项做成清单，适合快速分发给不同角色。",
    schedule: "每天 08:30",
    ownerRoles: ["运营", "投放", "履约"],
    defaultQuestion: "哪些监测器异常了",
    outputs: ["风险监测器", "关注监测器", "优先级分组", "进入详情页 / AI / Tasks"],
    enabled: true,
    sortOrder: 3,
  },
];

export function listScheduledAutomationTasks(): ScheduledAutomationTaskView[] {
  return SCHEDULED_AUTOMATION_SEEDS.map((item) => ({
    ...item,
    createdAt: SCHEDULED_AUTOMATION_CREATED_AT,
    updatedAt: SCHEDULED_AUTOMATION_CREATED_AT,
  }));
}
