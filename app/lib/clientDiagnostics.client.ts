/** 客户端白屏诊断：仅在浏览器 console 输出，不阻断渲染。 */

export type ValueShape = {
  type: string;
  isArray: boolean;
  length?: number;
};

export function describeValueShape(value: unknown): ValueShape {
  if (Array.isArray(value)) {
    return { type: "array", isArray: true, length: value.length };
  }
  if (value === null) {
    return { type: "null", isArray: false };
  }
  return { type: typeof value, isArray: false };
}

export function logClientDiagnostic(
  scope: string,
  detail: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  console.info(`[SparkDiag] ${scope}`, detail);
}

export function logClientRenderError(
  error: unknown,
  info?: { componentStack?: string },
): void {
  if (typeof window === "undefined") return;
  console.error("[SparkDiag] render_error", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    componentStack: info?.componentStack,
    href: window.location.href,
    origin: window.location.origin,
  });
}

/** 若页面仍请求 Spring 模板 API，说明跑的是遗留前端而非 Spark。 */
let springFetchPatched = false;

export function warnIfLegacySpringRequests(): void {
  if (typeof window === "undefined" || typeof window.fetch !== "function") return;
  if (springFetchPatched) return;
  springFetchPatched = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (
      url.includes("springbackend") ||
      url.includes("/api/template/getTemplateByShopName")
    ) {
      console.error("[SparkDiag] legacy_spring_request_detected", {
        url,
        hint: "当前 Spark 主应用不应请求 Spring 模板 API；请确认 Render 服务与 Shopify application_url 是否指向 Spark 而非 DescriptionFDProd 遗留部署。",
      });
    }
    return nativeFetch(input, init);
  }) as typeof window.fetch;
}
