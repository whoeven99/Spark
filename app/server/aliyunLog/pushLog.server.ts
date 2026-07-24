import { getSlsClient } from "./slsClient.server";
import { getAliyunLogConfig } from "./config.server";

export type SlsLogContent = Record<string, string>;

export type PushSlsLogInput = {
  topic: string;
  source: string;
  content: SlsLogContent;
  /** 上报时刻（毫秒）。不传则用 `Date.now()`。 */
  timestamp?: number;
};

export type PushSlsLogResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "client_init_failed" | "request_failed"; error?: unknown };

/**
 * 通用 SLS 写入函数。失败不会抛出，由调用方决定如何处理。
 *
 * - content 的 value 全部 String() 兜底，避免 LogClient 拒绝非字符串字段；
 * - 配置缺失（凭证未填 / 显式 disable）走静默降级，仅 warn 一次；
 * - timestamp 归一化为秒级整数。
 */
export async function pushSlsLog(
  input: PushSlsLogInput,
): Promise<PushSlsLogResult> {
  const cfg = getAliyunLogConfig();
  if (!cfg) {
    return { ok: false, reason: "not_configured" };
  }

  const sls = getSlsClient();
  if (!sls) {
    return { ok: false, reason: "client_init_failed" };
  }

  const ts = Math.floor((input.timestamp ?? Date.now()) / 1000);
  const safeContent: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.content)) {
    safeContent[k] = v == null ? "" : String(v);
  }

  const logGroup = {
    logs: [
      {
        content: safeContent,
        timestamp: ts,
      },
    ],
    topic: input.topic,
    source: input.source,
  };

  try {
    await sls.postLogStoreLogs(cfg.project, cfg.logstore, logGroup);
    return { ok: true };
  } catch (err) {
    console.warn(
      `[aliyunLog] postLogStoreLogs failed (topic=${input.topic} source=${input.source}):`,
      err,
    );
    return { ok: false, reason: "request_failed", error: err };
  }
}
