/**
 * 阿里云 SLS（Log Service）配置读取层。
 *
 * 设计原则与 `cosmosSparkOps.server.ts` 一致：
 * - 不在模块顶层创建客户端 / 抛错，避免路由 SSR 加载时崩溃；
 * - 配置缺失走"静默降级"，由调用方决定是否记 warn。
 */

const DEFAULT_PROJECT = "ciwi-log";
const DEFAULT_LOGSTORE = "bogdatech-prod";
const DEFAULT_REGION = "us-west-1";

export type AliyunLogConfig = {
  accessKeyId: string;
  accessKeySecret: string;
  endpoint: string;
  region: string;
  project: string;
  logstore: string;
};

function readEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function isAliyunLogEnabled(): boolean {
  const v = readEnv("ALIYUN_LOG_ENABLED").toLowerCase();
  // 默认启用；显式 false / 0 / off 关闭。
  if (!v) return true;
  return !(v === "false" || v === "0" || v === "off" || v === "no");
}

export function isAliyunLogConfigured(): boolean {
  if (!isAliyunLogEnabled()) return false;
  return Boolean(
    readEnv("ALIBABA_CLOUD_ACCESS_KEY_ID") &&
      readEnv("ALIBABA_CLOUD_ACCESS_KEY_SECRET") &&
      readEnv("ALIBABA_CLOUD_ENDPOINT"),
  );
}

export function getAliyunLogConfig(): AliyunLogConfig | null {
  if (!isAliyunLogConfigured()) return null;
  return {
    accessKeyId: readEnv("ALIBABA_CLOUD_ACCESS_KEY_ID"),
    accessKeySecret: readEnv("ALIBABA_CLOUD_ACCESS_KEY_SECRET"),
    endpoint: readEnv("ALIBABA_CLOUD_ENDPOINT"),
    region: readEnv("ALIBABA_CLOUD_REGION") || DEFAULT_REGION,
    project: readEnv("ALIBABA_CLOUD_PROJECT") || DEFAULT_PROJECT,
    logstore: readEnv("ALIBABA_CLOUD_LOGSTORE") || DEFAULT_LOGSTORE,
  };
}
