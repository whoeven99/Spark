/**
 * 首页「进门一句话」：从当日经营快照压出结论，不调 LLM。
 * 有待办才给看详情；没数据才给去回补；正常只留句子。
 */

export type DailyPulseStatus = "ok" | "attention" | "no_data" | "syncing";

export type DailyPulse = {
  status: DailyPulseStatus;
  snapshotDate: string | null;
  openTaskCount: number;
  /** 最多两条，给 attention 文案拼原因 */
  reasons: string[];
};

export type DailyPulseSourceItem = {
  name: string;
  status: string;
};

export type DailyPulseSourceTask = {
  title: string;
  status: string;
  quadrant: string;
};

export type DailyPulseSource = {
  hasData: boolean;
  snapshotDate: string;
  items: DailyPulseSourceItem[];
  tasks: DailyPulseSourceTask[];
};

const ACTIVE_TASK = new Set(["open", "in_progress"]);

function activeTasks(tasks: DailyPulseSourceTask[]): DailyPulseSourceTask[] {
  return tasks.filter((task) => ACTIVE_TASK.has(task.status));
}

function attentionReasons(source: DailyPulseSource): string[] {
  const fromTasks = activeTasks(source.tasks)
    .slice()
    .sort((a, b) => {
      if (a.quadrant === b.quadrant) return 0;
      return a.quadrant === "q1" ? -1 : 1;
    })
    .map((task) => task.title.trim())
    .filter(Boolean);
  if (fromTasks.length > 0) return fromTasks.slice(0, 2);

  return source.items
    .filter((item) => item.status === "risk" || item.status === "watch")
    .map((item) => item.name.trim())
    .filter(Boolean)
    .slice(0, 2);
}

export function formatDailyPulseHeadline(
  pulse: DailyPulse,
  t: (key: string, options?: Record<string, unknown>) => string,
  reasonJoiner: string,
): string {
  switch (pulse.status) {
    case "ok":
      return t("workspace.home.pulse.ok");
    case "syncing":
      return t("workspace.home.pulse.syncing");
    case "no_data":
      return t("workspace.home.pulse.noData");
    case "attention":
      if (pulse.reasons.length === 0) {
        return t("workspace.home.pulse.attentionPlain", { count: pulse.openTaskCount });
      }
      return t("workspace.home.pulse.attention", {
        count: pulse.openTaskCount,
        reasons: pulse.reasons.join(reasonJoiner),
      });
    default: {
      const _exhaustive: never = pulse.status;
      return _exhaustive;
    }
  }
}

/** 首页问候用：有快照用快照；无快照且订单为 0 才提示回补；有单但快照未就绪则留空。 */
export function resolveHomeDailyPulse(
  source: DailyPulseSource | null,
  options?: { backfillRunning?: boolean; orderCount?: number },
): DailyPulse | null {
  if (source) {
    return buildDailyPulse(source, { backfillRunning: options?.backfillRunning });
  }
  if (options?.backfillRunning) {
    return buildDailyPulse(null, { backfillRunning: true });
  }
  if ((options?.orderCount ?? -1) === 0) {
    return buildDailyPulse(null);
  }
  return null;
}

export function buildDailyPulse(
  source: DailyPulseSource | null,
  options?: { backfillRunning?: boolean },
): DailyPulse {
  if (source?.hasData) {
    const tasks = activeTasks(source.tasks);
    const flagged = source.items.filter(
      (item) => item.status === "risk" || item.status === "watch",
    );
    if (tasks.length > 0 || flagged.length > 0) {
      return {
        status: "attention",
        snapshotDate: source.snapshotDate,
        openTaskCount: tasks.length > 0 ? tasks.length : flagged.length,
        reasons: attentionReasons(source),
      };
    }
    return {
      status: "ok",
      snapshotDate: source.snapshotDate,
      openTaskCount: 0,
      reasons: [],
    };
  }

  if (options?.backfillRunning) {
    return {
      status: "syncing",
      snapshotDate: source?.snapshotDate ?? null,
      openTaskCount: 0,
      reasons: [],
    };
  }

  return {
    status: "no_data",
    snapshotDate: source?.snapshotDate ?? null,
    openTaskCount: 0,
    reasons: [],
  };
}
