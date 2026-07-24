/**
 * 本地 ambient 声明：`@alicloud/log` v1.x 不附带 TypeScript 类型。
 * 仅声明我们实际用到的最小 API 表面。bundleV2 同样依赖此包但未声明类型，
 * Spark 项目开启了 strict，因此需要在此提供 minimal types 以通过 typecheck。
 */
declare module "@alicloud/log" {
  export interface ClientOptions {
    accessKeyId: string;
    accessKeySecret: string;
    endpoint: string;
    region?: string;
  }

  export interface SlsLogEntry {
    content: Record<string, string>;
    /** 秒级时间戳。 */
    timestamp?: number;
  }

  export interface SlsLogGroup {
    logs: SlsLogEntry[];
    topic?: string;
    source?: string;
  }

  /** GetLogs / 分析查询的可选参数。 */
  export interface GetLogsOptions {
    /** 仅查询某个 topic（SLS Topic 维度）。 */
    topic?: string;
    /**
     * 查询语句。纯检索（如 `shopName: "x.myshopify.com"`）或带 SQL 分析
     * （`<检索> | SELECT ... GROUP BY ...`）。带 `|SELECT` 时返回聚合行。
     */
    query?: string;
    /** 返回行数上限（默认 100，分析查询为聚合行数上限）。 */
    line?: number;
    /** 分页偏移（仅原始日志查询有意义）。 */
    offset?: number;
    /** 是否按时间倒序。 */
    reverse?: boolean;
  }

  /**
   * GetLogs 返回的单行。原始日志含 `__time__` / `__topic__` / `__source__`
   * 等内置字段；SQL 分析查询则为聚合列。值统一为字符串。
   */
  export type SlsLogRow = Record<string, string>;

  export default class Client {
    constructor(options: ClientOptions);
    postLogStoreLogs(
      projectName: string,
      logstoreName: string,
      logGroup: SlsLogGroup,
    ): Promise<unknown>;
    /**
     * 查询日志 / 执行 SQL 分析。`from` / `to` 为 Date（SDK 内部转秒）。
     * 带 `|SELECT` 的 query 返回聚合结果行数组。
     */
    getLogs(
      projectName: string,
      logstoreName: string,
      from: Date,
      to: Date,
      data?: GetLogsOptions,
      options?: unknown,
    ): Promise<SlsLogRow[]>;
    /** 直方图查询：返回时间桶计数与总命中数。 */
    getHistograms(
      projectName: string,
      logstoreName: string,
      from: Date,
      to: Date,
      data?: GetLogsOptions,
      options?: unknown,
    ): Promise<{ count?: number; histograms?: unknown[]; progress?: string }>;
  }
}
