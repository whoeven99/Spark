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

  export default class Client {
    constructor(options: ClientOptions);
    postLogStoreLogs(
      projectName: string,
      logstoreName: string,
      logGroup: SlsLogGroup,
    ): Promise<unknown>;
  }
}
