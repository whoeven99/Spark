/**
 * POST /api/task-proposal
 *
 * 通用任务确认卡片（TaskProposalCard）的后端入口：
 *   { intent: "estimate", skillId, params }            → per-item 估算（分桶 EWMA）
 *   { intent: "execute",  skillId, params, targets }   → 按 skillId 路由到注册表执行
 */
import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { z } from "zod";
import { authenticate } from "../shopify.server";
import {
  getTaskProposalSkillHandler,
  TaskProposalBillingError,
  TASK_PROPOSAL_MAX_TARGETS,
} from "../server/taskProposal/taskProposalSkills.server";
import { resolveObjectQueryTargets } from "../server/shopify/shopifyObjectList.server";
import type {
  TaskProposalEstimateResponse,
  TaskProposalExecuteResponse,
} from "../lib/taskProposalPayload";
import { detectRequestLocale, readShopifySessionLocale } from "../i18n/detector.server";
import { initI18n } from "../i18n";

const paramsSchema = z.record(z.string(), z.string());

const estimateSchema = z.object({
  intent: z.literal("estimate"),
  skillId: z.string().min(1),
  params: paramsSchema.default({}),
});

/** 按条件圈定（阶段 2）：执行时由服务端重新求值为具体对象，不固化 ID */
const targetsQuerySchema = z.object({
  kind: z.enum(["product", "article"]),
  keyword: z.string().max(120).optional(),
  status: z.enum(["all", "active", "draft", "archived", "published"]).optional(),
  tag: z.string().max(80).optional(),
  maxInventory: z.number().int().min(0).optional(),
});

const executeSchema = z.object({
  intent: z.literal("execute"),
  skillId: z.string().min(1),
  params: paramsSchema.default({}),
  targets: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().default(""),
        imageUrl: z.string().nullable().optional(),
      }),
    )
    .max(TASK_PROPOSAL_MAX_TARGETS, `最多一次执行 ${TASK_PROPOSAL_MAX_TARGETS} 个对象`)
    .default([]),
  targetsQuery: targetsQuerySchema.optional(),
});

const requestSchema = z.discriminatedUnion("intent", [estimateSchema, executeSchema]);

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return data({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return data({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("；");
    return data({ ok: false, error: msg }, { status: 400 });
  }

  const body = parsed.data;
  const handler = getTaskProposalSkillHandler(body.skillId);
  if (!handler) {
    return data(
      { ok: false, error: `未知的任务类型：${body.skillId}` },
      { status: 400 },
    );
  }

  if (body.intent === "estimate") {
    try {
      const estimate = await handler.estimate({ params: body.params });
      return data<TaskProposalEstimateResponse>({ ok: true, ...estimate });
    } catch (e) {
      console.error("[TaskProposal] estimate failed:", e);
      // 估算失败不阻塞用户，返回空估算
      return data<TaskProposalEstimateResponse>({
        ok: true,
        perItemCredits: null,
        perItemSeconds: null,
      });
    }
  }

  const locale = detectRequestLocale(request, {
    sessionLocale: readShopifySessionLocale(session),
  });
  const i18n = initI18n(locale);
  const t = i18n.t.bind(i18n);

  // 显式 ID 优先；否则按圈定条件在执行期重新求值；无目标对象技能允许空 targets
  let targets = body.targets;
  if (targets.length === 0 && !handler.allowEmptyTargets) {
    if (!body.targetsQuery) {
      return data(
        { ok: false, error: "至少选择 1 个对象，或提供圈定条件" },
        { status: 400 },
      );
    }
    try {
      const resolved = await resolveObjectQueryTargets(
        admin,
        body.targetsQuery,
        TASK_PROPOSAL_MAX_TARGETS,
      );
      if (resolved.overflow) {
        return data<TaskProposalExecuteResponse>(
          {
            ok: false,
            error: `当前条件匹配数超过单次执行上限（${TASK_PROPOSAL_MAX_TARGETS} 个），请收紧条件后重试`,
          },
          { status: 400 },
        );
      }
      if (resolved.targets.length === 0) {
        return data<TaskProposalExecuteResponse>(
          { ok: false, error: "当前条件未匹配到任何对象，请调整条件后重试" },
          { status: 400 },
        );
      }
      targets = resolved.targets;
    } catch (e) {
      console.error("[TaskProposal] resolve targetsQuery failed:", e);
      return data<TaskProposalExecuteResponse>(
        { ok: false, error: "按条件求值失败，请稍后重试" },
        { status: 500 },
      );
    }
  }

  try {
    const result = await handler.execute({
      admin,
      shop,
      locale,
      t,
      params: body.params,
      targets,
    });
    return data<TaskProposalExecuteResponse>({
      ok: true,
      created: result.taskIds.length,
      taskIds: result.taskIds,
      errors: result.errors,
    });
  } catch (e) {
    if (e instanceof TaskProposalBillingError) {
      return data<TaskProposalExecuteResponse>(
        { ok: false, error: t("billing.lowBalanceWarning") },
        { status: 402 },
      );
    }
    console.error("[TaskProposal] execute failed:", e);
    return data<TaskProposalExecuteResponse>(
      { ok: false, error: e instanceof Error ? e.message : "执行失败" },
      { status: 500 },
    );
  }
};
