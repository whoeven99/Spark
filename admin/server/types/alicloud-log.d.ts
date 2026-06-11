/**
 * 本地 ambient 声明：`@alicloud/log` v1.x 不附带 TypeScript 类型。
 * 仅声明 admin 实际用到的最小 API 表面（查询日志 + 直方图统计）。
 * 与主项目 `app/server/aliyunLog/alicloud-log.d.ts` 各自独立声明。
 */
declare module "@alicloud/log" {
  export interface ClientOptions {
    accessKeyId: string;
    accessKeySecret: string;
    endpoint: string;
    region?: string;
  }

  export interface GetLogsQuery {
    /** SLS 查询语句（字段查询需 logstore 已开启索引）。 */
    query?: string;
    /** 按 topic 精确过滤（无需索引）。 */
    topic?: string;
    /** 返回行数，默认 100，最大 100。 */
    line?: number;
    offset?: number;
    /** true 时按时间倒序返回。 */
    reverse?: boolean;
  }

  /** GetLogs 返回的单条日志：content 字段 + `__time__` / `__source__` 等系统字段。 */
  export type SlsLogRecord = Record<string, string>;

  export interface GetHistogramsQuery {
    query?: string;
    topic?: string;
  }

  export interface SlsHistogramBucket {
    from: number;
    to: number;
    count: number;
    progress: "Complete" | "Incomplete";
  }

  /** 透传给底层 httpx.request 的选项（默认 read timeout 仅 3s，跨洋查询需调大）。 */
  export interface RequestOptions {
    timeout?: number;
    readTimeout?: number;
    connectTimeout?: number;
  }

  export default class Client {
    constructor(options: ClientOptions);
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
  }
}
