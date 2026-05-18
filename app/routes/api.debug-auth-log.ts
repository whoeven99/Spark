import type { LoaderFunctionArgs } from "react-router";
import {
  extractEnvSnapshot,
  getDebugAuthLogs,
} from "../server/debug/authDebug.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("enable") !== "1") {
    return Response.json(
      {
        ok: false,
        message:
          "Append ?enable=1 to fetch recent auth debug logs from this instance.",
      },
      { status: 403 },
    );
  }

  return Response.json({
    ok: true,
    env: extractEnvSnapshot(),
    logs: getDebugAuthLogs(),
  });
};
