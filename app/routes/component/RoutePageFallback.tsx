/** 路由级 lazy 页面共用占位，与嵌入式 iframe 首屏风格一致。 */
export function RoutePageFallback() {
  return (
    <div style={{ padding: "1.25rem", color: "#6d7175", fontSize: "0.9rem" }}>
      Loading…
    </div>
  );
}
