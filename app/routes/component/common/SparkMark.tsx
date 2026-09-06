import { useRouteLoaderData } from "react-router";
import { SPARK_AVATAR_SRC_PROD } from "../../../lib/sparkAvatar";

/** Spark 系统头像（侧栏品牌 + 聊天气泡）。测环境用青绿标。 */
export function SparkMark({ size = 20 }: { size?: number }) {
  const appData = useRouteLoaderData("routes/app") as
    | { sparkAvatarSrc?: string }
    | undefined;
  const src = appData?.sparkAvatarSrc || SPARK_AVATAR_SRC_PROD;

  return (
    <img
      src={src}
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
