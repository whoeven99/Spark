/** Spark 系统头像（侧栏品牌 + 聊天气泡）。 */
export function SparkMark({ size = 20 }: { size?: number }) {
  return (
    <img
      src="/spark-ai-avatar.svg"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      style={{
        width: size,
        height: size,
        display: "block",
        borderRadius: Math.max(4, Math.round(size * 0.22)),
        objectFit: "cover",
      }}
    />
  );
}
