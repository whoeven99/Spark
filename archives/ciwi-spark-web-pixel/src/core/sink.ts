import type { PixelEventEnvelope } from "./schema";

export type SinkOptions = {
  endpoint: string;
  /** 0-100，0 表示完全禁用，100 表示全采样。 */
  sampling: number;
  debug: boolean;
};

export type Sink = {
  send: (envelope: PixelEventEnvelope) => Promise<void>;
};

function shouldSample(sampling: number): boolean {
  if (sampling >= 100) return true;
  if (sampling <= 0) return false;
  // 简单 Math.random 抽样；可接受的偏差量级。
  return Math.random() * 100 < sampling;
}

async function postOnce(endpoint: string, body: string): Promise<Response> {
  return fetch(endpoint, {
    method: "POST",
    // 用 text/plain 避免 CORS preflight，后端会 JSON.parse。
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body,
    keepalive: true,
    credentials: "omit",
    mode: "cors",
  });
}

/**
 * 创建上报 sink：
 * - 命中采样后 fetch keepalive POST 到 ingest 端点；
 * - 网络/4xx 异常时退避 500ms 重试一次（**仅一次**）；
 * - 任何异常都吞掉 + warn，绝不让错误冒泡到 Web Pixel sandbox。
 */
export function createSink(opts: SinkOptions): Sink {
  return {
    async send(envelope) {
      if (!shouldSample(opts.sampling)) return;
      const body = JSON.stringify(envelope);

      if (opts.debug) {
        // eslint-disable-next-line no-console
        console.log("[ciwi-spark-web-pixel] send", envelope.event, envelope);
      }

      try {
        const resp = await postOnce(opts.endpoint, body);
        if (resp.ok) return;
        // 5xx / 429 才重试；4xx 大概率是输入有问题，重试无意义。
        if (resp.status < 500 && resp.status !== 429) return;
      } catch (err) {
        if (opts.debug) {
          // eslint-disable-next-line no-console
          console.warn("[ciwi-spark-web-pixel] send error, will retry once", err);
        }
      }

      await new Promise((r) => setTimeout(r, 500));
      try {
        await postOnce(opts.endpoint, body);
      } catch (err) {
        if (opts.debug) {
          // eslint-disable-next-line no-console
          console.warn("[ciwi-spark-web-pixel] send retry failed, dropping", err);
        }
      }
    },
  };
}
