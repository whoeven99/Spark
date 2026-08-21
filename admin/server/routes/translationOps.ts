import { Router } from "express";

export const translationOpsRouter = Router();

/** Spring 后端已下线：暂停所有 upstream 请求。 */
const SPRING_BACKEND_DISABLED_MESSAGE =
  "SpringBackend 已下线，翻译运维相关接口已暂停";

function rejectSpringBackend(res: import("express").Response): void {
  res.status(503).json({
    error: SPRING_BACKEND_DISABLED_MESSAGE,
    disabled: true,
  });
}

translationOpsRouter.get("/config", async (_req, res) => {
  rejectSpringBackend(res);

  /*
  const env = resolveEnv(req);
  const base = getSpringBackendBaseUrl(env);
  const upstream = await fetch(`${base}/bogdaconfig`);
  ...
  */
});

translationOpsRouter.put("/config", async (_req, res) => {
  rejectSpringBackend(res);

  /*
  const upstream = await fetch(url.toString(), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  ...
  */
});

translationOpsRouter.delete("/config", async (_req, res) => {
  rejectSpringBackend(res);

  /*
  const upstream = await fetch(url.toString(), { method: "DELETE" });
  ...
  */
});

translationOpsRouter.post("/add-quota", async (_req, res) => {
  rejectSpringBackend(res);

  /*
  const upstream = await fetch(`${base}/todoBConfig`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shopName, addChars: String(addChars) }),
  });
  ...
  */
});
