import { Router } from "express";
import {
  getSpringBackendBaseUrl,
  parseSpringBackendEnv,
  type SpringBackendEnv,
} from "../lib/springBackend.js";

export const translationOpsRouter = Router();

type BogdaConfigMap = Record<string, string>;

type AddQuotaResult = {
  oldChars: string;
  addChars: string;
  newChars: string;
};

function upstreamError(status: number, body: string): { error: string } {
  const snippet = body.trim().slice(0, 300);
  return {
    error: snippet
      ? `SpringBackend 返回 HTTP ${status}：${snippet}`
      : `SpringBackend 返回 HTTP ${status}`,
  };
}

async function readUpstreamJson<T>(upstream: Response): Promise<T> {
  const text = await upstream.text();
  if (!upstream.ok) {
    throw Object.assign(new Error("upstream_failed"), {
      status: upstream.status,
      body: text,
    });
  }
  if (!text.trim()) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

function resolveEnv(req: { query: Record<string, unknown> }): SpringBackendEnv {
  return parseSpringBackendEnv(req.query.env);
}

translationOpsRouter.get("/config", async (req, res) => {
  const env = resolveEnv(req);
  const base = getSpringBackendBaseUrl(env);
  try {
    const upstream = await fetch(`${base}/bogdaconfig`);
    const data = await readUpstreamJson<BogdaConfigMap>(upstream);
    res.json({ env, config: data });
  } catch (e) {
    if (e && typeof e === "object" && "status" in e && "body" in e) {
      const err = e as { status: number; body: string };
      res.status(502).json(upstreamError(err.status, err.body));
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({ error: `获取配置失败：${msg}` });
  }
});

translationOpsRouter.put("/config", async (req, res) => {
  const env = resolveEnv(req);
  const key = String(req.query.key ?? "").trim();
  const value = String(req.query.value ?? "");
  if (!key) {
    res.status(400).json({ error: "key 不能为空" });
    return;
  }

  const base = getSpringBackendBaseUrl(env);
  const url = new URL(`${base}/bogdaconfig`);
  url.searchParams.set("key", key);
  url.searchParams.set("value", value);

  try {
    const upstream = await fetch(url.toString(), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const data = await readUpstreamJson<BogdaConfigMap>(upstream);
    res.json({ env, config: data });
  } catch (e) {
    if (e && typeof e === "object" && "status" in e && "body" in e) {
      const err = e as { status: number; body: string };
      res.status(502).json(upstreamError(err.status, err.body));
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({ error: `保存配置失败：${msg}` });
  }
});

translationOpsRouter.delete("/config", async (req, res) => {
  const env = resolveEnv(req);
  const key = String(req.query.key ?? "").trim();
  if (!key) {
    res.status(400).json({ error: "key 不能为空" });
    return;
  }

  const base = getSpringBackendBaseUrl(env);
  const url = new URL(`${base}/bogdaconfig`);
  url.searchParams.set("key", key);

  try {
    const upstream = await fetch(url.toString(), { method: "DELETE" });
    const data = await readUpstreamJson<BogdaConfigMap>(upstream);
    res.json({ env, config: data });
  } catch (e) {
    if (e && typeof e === "object" && "status" in e && "body" in e) {
      const err = e as { status: number; body: string };
      res.status(502).json(upstreamError(err.status, err.body));
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({ error: `删除配置失败：${msg}` });
  }
});

translationOpsRouter.post("/add-quota", async (req, res) => {
  // 额度操作固定走 Prod，与 monitor 行为一致
  const env = "prod" as const;
  const shopName = String(req.body?.shopName ?? "").trim();
  const addChars = Number(req.body?.addChars);

  if (!shopName) {
    res.status(400).json({ error: "商店名不能为空" });
    return;
  }
  if (!Number.isFinite(addChars)) {
    res.status(400).json({ error: "添加额度数量无效" });
    return;
  }

  const base = getSpringBackendBaseUrl(env);
  try {
    const upstream = await fetch(`${base}/todoBConfig`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopName,
        addChars: String(addChars),
      }),
    });
    const data = await readUpstreamJson<AddQuotaResult>(upstream);
    res.json({ env, ...data });
  } catch (e) {
    if (e && typeof e === "object" && "status" in e && "body" in e) {
      const err = e as { status: number; body: string };
      res.status(502).json(upstreamError(err.status, err.body));
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({ error: `增加额度失败：${msg}` });
  }
});
