import type { LoaderFunctionArgs } from "react-router";
import { getSparkBuildInfo } from "../lib/sparkBuildInfo.server";

/** 部署自检：无需鉴权，便于 curl / 浏览器确认当前运行的代码版本。 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const buildInfo = getSparkBuildInfo();
  const host = request.headers.get("host");

  console.info("[SparkDiag] build_info", { host, ...buildInfo });

  return Response.json(
    {
      ok: true,
      ...buildInfo,
      host,
      expectsSpringTemplateApi: false,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
};
