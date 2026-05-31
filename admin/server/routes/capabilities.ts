import { Router } from "express";
import { getEnv } from "../lib/env.js";

export const capabilitiesRouter = Router();

/**
 * AI 能力概览 —— 单一事实源。
 *
 * 数据由主 App 的 `/api/ai-capabilities` 路由从注册表自动派生，
 * admin 仅做代理转发，避免手抄技能/工具/流程而长期漂移。
 *
 * 环境变量：
 *  - AI_CAPABILITIES_URL：主 App 能力清单完整 URL
 *    （如 https://<app-host>/api/ai-capabilities）
 *  - AI_CAPABILITIES_TOKEN：可选，与主 App 一致时携带 Bearer 鉴权
 */
capabilitiesRouter.get("/", async (_req, res) => {
  const url = getEnv("AI_CAPABILITIES_URL");
  if (!url) {
    res.status(503).json({
      error:
        "未配置 AI_CAPABILITIES_URL：请将其指向主 App 的 /api/ai-capabilities，能力清单会从注册表自动派生。",
    });
    return;
  }

  const token = getEnv("AI_CAPABILITIES_TOKEN");
  try {
    const upstream = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!upstream.ok) {
      res.status(502).json({
        error: `获取能力清单失败：上游返回 HTTP ${upstream.status}`,
      });
      return;
    }
    const manifest = await upstream.json();
    res.json(manifest);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({ error: `获取能力清单失败：${msg}` });
  }
});
