/**
 * 标准事件信封，与后端 `app/server/aliyunLog/types.ts` 字段保持同步
 * （两侧独立声明，不跨 workspace 引用，便于 sandbox 隔离打包）。
 */

export const PIXEL_SCHEMA_VERSION = 1;

export type PixelEventPayload = Record<string, unknown>;

export type PixelEventEnvelope = {
  ts: number;
  event: string;
  schemaVersion: number;
  shopName: string;
  clientId: string;
  source: string;
  productId?: string;
  payload?: PixelEventPayload;
};

export type BaseContext = {
  shopName: string;
  clientId: string;
  source: string;
};

export function buildEnvelope(
  base: BaseContext,
  input: {
    event: string;
    productId?: string;
    payload?: PixelEventPayload;
    ts?: number;
  },
): PixelEventEnvelope {
  return {
    ts: input.ts ?? Date.now(),
    event: input.event,
    schemaVersion: PIXEL_SCHEMA_VERSION,
    shopName: base.shopName,
    clientId: base.clientId,
    source: base.source,
    productId: input.productId,
    payload: input.payload,
  };
}
