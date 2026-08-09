import { pageColorTokens } from "../../page/pageUiStyles";
import type { AITaskStatus } from "../../../lib/aiTaskTypes";

export type TaskStatusTone = {
  /** 文字与进度条填充色 */
  accent: string;
  /** 低强调底色 */
  surface: string;
  border: string;
};

/**
 * 任务状态 → 语义色的唯一来源，供状态胶囊与任务卡进度条共用。
 * 语义遵循 docs/DESIGN.md：进行中用 progress，待复核用 warning，
 * 完成用 success，失败用 critical，终止用中性色。
 */
const STATUS_TONE: Record<AITaskStatus, TaskStatusTone> = {
  running: {
    accent: pageColorTokens.progress,
    surface: pageColorTokens.progressBg,
    border: "rgba(192, 87, 23, 0.2)",
  },
  pending_review: {
    accent: pageColorTokens.warning,
    surface: pageColorTokens.warningBg,
    border: "rgba(185, 137, 0, 0.22)",
  },
  succeeded: {
    accent: pageColorTokens.brandGreen,
    surface: pageColorTokens.brandGreenLight,
    border: "rgba(0, 128, 96, 0.2)",
  },
  applied: {
    accent: pageColorTokens.brandGreen,
    surface: pageColorTokens.brandGreenLight,
    border: "rgba(0, 128, 96, 0.2)",
  },
  scored: {
    accent: pageColorTokens.brandBlue,
    surface: pageColorTokens.brandBlueLight,
    border: "rgba(0, 91, 211, 0.18)",
  },
  failed: {
    accent: pageColorTokens.critical,
    surface: pageColorTokens.criticalBg,
    border: "rgba(216, 44, 13, 0.2)",
  },
  cancelled: {
    accent: pageColorTokens.neutralStatus,
    surface: pageColorTokens.surfaceMuted,
    border: pageColorTokens.borderSubtle,
  },
};

export function getTaskStatusTone(status: AITaskStatus): TaskStatusTone {
  return STATUS_TONE[status];
}

/** 任务卡进度条填充色：与状态胶囊同色，不使用渐变。 */
export function getTaskProgressBackground(status: AITaskStatus): string {
  return STATUS_TONE[status].accent;
}
