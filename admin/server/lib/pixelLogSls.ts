/// <reference path="../types/alicloud-log.d.ts" />
import { createRequire } from "node:module";
import type {
  ClientOptions,
  GetHistogramsQuery,
  GetLogsQuery,
  RequestOptions,
  SlsHistogramBucket,
  SlsLogRecord,
} from "@alicloud/log";
import { getEnv } from "./env.js";

/** admin 实际用到的 SLS 查询 API（与 ambient 声明一致）。 */
export type PixelLogSlsClient = {
  getLogs(
    projectName: string,
    logstoreName: string,
    from: Date,
    to: Date,
    data?: GetLogsQuery,
    options?: RequestOptions,
  ): Promise<SlsLogRecord[]>;
  getHistograms(
    projectName: string,
    logstoreName: string,
    from: Date,
    to: Date,
    data?: GetHistogramsQuery,
    options?: RequestOptions,
  ): Promise<SlsHistogramBucket[]>;
};

/** @alicloud/log 为 CJS（module.exports），ESM 下无 default export。 */
const require = createRequire(import.meta.url);
const LogClient = require("@alicloud/log") as new (
  options: ClientOptions,
) => PixelLogSlsClient;

/**
 * Web Pixel 日志查询的阿里云 SLS 配置。
 *
 * 与主应用 `app/server/aliyunLog/config.server.ts` 共用同一套环境变量：
 * - ALIBABA_CLOUD_ACCESS_KEY_ID / _ACCESS_KEY_SECRET / _ENDPOINT（必填）
 * - ALIBABA_CLOUD_PROJECT / _LOGSTORE / _REGION（可选，有默认值）
 *
 * 切换测试 / 正式环境时，手动修改 logstore（及必要时 project）即可。
 */

const DEFAULT_PROJECT = "ciwi-log";
const DEFAULT_LOGSTORE = "bogdatech-prod";
const DEFAULT_REGION = "us-west-1";

export type PixelLogSlsConfig = {
  accessKeyId: string;
  accessKeySecret: string;
  endpoint: string;
  region: string;
  project: string;
  logstore: string;
};

export function getPixelLogSlsConfig(): PixelLogSlsConfig | null {
  const accessKeyId = getEnv("ALIBABA_CLOUD_ACCESS_KEY_ID");
  const accessKeySecret = getEnv("ALIBABA_CLOUD_ACCESS_KEY_SECRET");
  const endpoint = getEnv("ALIBABA_CLOUD_ENDPOINT");
  if (!accessKeyId || !accessKeySecret || !endpoint) return null;

  return {
    accessKeyId,
    accessKeySecret,
    endpoint,
    region: getEnv("ALIBABA_CLOUD_REGION", DEFAULT_REGION),
    project: getEnv("ALIBABA_CLOUD_PROJECT", DEFAULT_PROJECT),
    logstore: getEnv("ALIBABA_CLOUD_LOGSTORE", DEFAULT_LOGSTORE),
  };
}

let cachedClient: { key: string; client: PixelLogSlsClient } | null = null;

/** 懒加载 SLS 客户端；环境变量变化（极少发生）时自动重建。 */
export function getPixelLogSlsClient(): {
  client: PixelLogSlsClient;
  config: PixelLogSlsConfig;
} | null {
  const config = getPixelLogSlsConfig();
  if (!config) return null;

  const key = `${config.endpoint}|${config.accessKeyId}|${config.project}|${config.logstore}`;
  if (cachedClient && cachedClient.key === key) {
    return { client: cachedClient.client, config };
  }

  const client = new LogClient({
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    endpoint: config.endpoint,
    region: config.region,
  }) as PixelLogSlsClient;
  cachedClient = { key, client };
  return { client, config };
}
