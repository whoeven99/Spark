// ──────────────────────────────────────────────
// 统一的 Skill「步骤 + 进度」类型层
// 原子 Skill（Atomic）与复合 Skill（Playbook）共用同一套协议：
//  - 静态：用 StepSpec[] 声明流程，供 admin 渲染流程图
//  - 运行时：用 SkillProgressEvent 上报进度，供聊天界面实时点亮「正在…」
// ──────────────────────────────────────────────

/**
 * 运营闭环环节，与《电商运营业务目标与 Skills 清单》0.4 对齐。
 * 用于 admin 分组/配色，并帮助 LLM 理解某个能力位于链路哪一段。
 */
export type SkillStage =
  | "dataAlign" // 数据对齐
  | "monitor" // 监控与发现
  | "diagnose" // 问题定位
  | "propose" // 方案产出
  | "qc" // 质检与风控
  | "execute" // 执行
  | "review"; // 复盘验证

export const SKILL_STAGE_LABELS: Record<SkillStage, string> = {
  dataAlign: "数据对齐",
  monitor: "监控与发现",
  diagnose: "问题定位",
  propose: "方案产出",
  qc: "质检与风控",
  execute: "执行",
  review: "复盘验证",
};

/**
 * 步骤类型，决定前端图标/动画与 admin 流程图配色。
 */
export type StepKind =
  | "data" // 拉取/同步数据
  | "compute" // 纯计算/聚合
  | "llm" // 调用大模型
  | "tool" // 调用外部工具/API
  | "qc" // 质检/校验
  | "execute"; // 写回/执行副作用

export const STEP_KIND_LABELS: Record<StepKind, string> = {
  data: "数据",
  compute: "计算",
  llm: "大模型",
  tool: "工具",
  qc: "质检",
  execute: "执行",
};

/**
 * 单个流程步骤的静态声明。
 */
export interface StepSpec {
  /** 稳定标识；进度事件按 id 匹配，避免 label 改名导致错位 */
  id: string;
  /** 展示名，如「润色关键词」 */
  label: string;
  kind: StepKind;
  stage?: SkillStage;
  /** 进行态文案，如「正在润色关键词…」；缺省时前端用 `正在${label}` */
  runningLabel?: string;
  /** 是否可被跳过（如缺少入参时） */
  optional?: boolean;
}

/** 步骤声明的输入形式：可直接写字符串（label 即 id），也可写完整 StepSpec。 */
export type StepInput = string | StepSpec;

/** 把字符串/StepSpec 混合输入规范化为 StepSpec（向后兼容旧的 string[] 写法）。 */
export function normalizeStep(input: StepInput, fallbackKind: StepKind = "compute"): StepSpec {
  if (typeof input === "string") {
    return { id: input, label: input, kind: fallbackKind };
  }
  return { ...input, kind: input.kind ?? fallbackKind };
}

export function normalizeSteps(
  inputs: readonly StepInput[] | undefined,
  fallbackKind: StepKind = "compute",
): StepSpec[] {
  return (inputs ?? []).map((s) => normalizeStep(s, fallbackKind));
}

// ──────────────────────────────────────────────
// 运行时进度
// ──────────────────────────────────────────────

export type SkillProgressStatus = "running" | "completed" | "skipped" | "error";

/**
 * 统一进度事件（原子 & 复合共用）。
 */
export interface SkillProgressEvent {
  /** 发起进度的 skill / playbook 名称 */
  skill: string;
  /** 对应 StepSpec.id */
  stepId: string;
  /** 展示文案（通常取 StepSpec.label / runningLabel） */
  label: string;
  status: SkillProgressStatus;
  /** 细节补充，如「调用 deepseek-chat」「生成 3 张候选」 */
  detail?: string;
}

/** Context 上挂载的进度发射器签名。 */
export type EmitSkillProgress = (event: SkillProgressEvent) => void;
