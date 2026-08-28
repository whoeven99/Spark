/**
 * 从 Web Pixel 注入的 settings 中读取并归一化配置。所有字段都是
 * `single_line_text_field`，需要在这里解析为合适的类型。
 */

export type PixelExtensionSettings = {
  shopName: string;
  ingestEndpoint: string;
  /** 0-100 整数，默认 100。 */
  sampling: number;
  /** 是否开启调试日志，默认 false。 */
  debug: boolean;
};

function toBool(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const s = v.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "on";
}

function toSampling(v: unknown): number {
  if (typeof v !== "string" || !v.trim()) return 100;
  const n = Number(v);
  if (!Number.isFinite(n)) return 100;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function readPixelSettings(
  raw: Record<string, unknown> | undefined | null,
): PixelExtensionSettings | null {
  const r = raw ?? {};
  const shopName = typeof r.shopName === "string" ? r.shopName.trim().toLowerCase() : "";
  const ingestEndpoint =
    typeof r.ingestEndpoint === "string" ? r.ingestEndpoint.trim() : "";

  if (!shopName || !ingestEndpoint) {
    // 缺关键字段时返回 null，由入口决定是否中止初始化。
    return null;
  }

  return {
    shopName,
    ingestEndpoint,
    sampling: toSampling(r.sampling),
    debug: toBool(r.debug),
  };
}
