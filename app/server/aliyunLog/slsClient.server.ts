import Client from "@alicloud/log";
import { getAliyunLogConfig } from "./config.server";

let cachedClient: Client | null = null;
let cachedKey = "";

/**
 * 懒加载 SLS 客户端。配置缺失返回 null，调用方需自行降级。
 *
 * 缓存键由 endpoint + accessKeyId 组成；环境变量切换（很少发生）会自动重建。
 */
export function getSlsClient(): Client | null {
  const cfg = getAliyunLogConfig();
  if (!cfg) return null;

  const key = `${cfg.endpoint}|${cfg.accessKeyId}`;
  if (cachedClient && cachedKey === key) {
    return cachedClient;
  }

  try {
    cachedClient = new Client({
      accessKeyId: cfg.accessKeyId,
      accessKeySecret: cfg.accessKeySecret,
      endpoint: cfg.endpoint,
      region: cfg.region,
    });
    cachedKey = key;
    return cachedClient;
  } catch (err) {
    console.warn("[aliyunLog] sls client init failed:", err);
    cachedClient = null;
    cachedKey = "";
    return null;
  }
}
