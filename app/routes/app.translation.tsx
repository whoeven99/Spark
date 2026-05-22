import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
// @ts-expect-error IDE 对该模块存在暂时性解析延迟，运行时路径有效
import { TranslationPage } from "./page/TranslationPage";
import {
  getTranslationJobsCosmosLocation,
  logTranslationCosmosTarget,
} from "../server/translation/cosmosJobStore.server";
import { createTranslationJob } from "../server/translation/translationPipelineCore.server";
import { ALLOWED_TRANSLATABLE_RESOURCE_TYPES } from "../server/translation/types";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  return data({
    shop: session.shop,
    defaults: {
      targetLocale: "fr",
      sourceLocale: "zh-CN",
      limitPerType: 20,
      resourceTypes: [...ALLOWED_TRANSLATABLE_RESOURCE_TYPES],
    },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    targetLocale?: string;
    sourceLocale?: string;
    resourceTypes?: string[];
    limitPerType?: number;
    batchSize?: number;
    maxRetries?: number;
    jobId?: string;
    itemId?: string;
  };

  const actionType = body.action?.trim();
  console.log(
    `[translation][action] shop=${session.shop} action=${actionType ?? "unknown"} jobId=${body.jobId ?? "-"}`,
  );

  try {
    if (actionType === "create_job") {
      const created = await createTranslationJob({
        shop: session.shop,
        targetLocale: body.targetLocale ?? "",
        sourceLocale: body.sourceLocale ?? "zh-CN",
        resourceTypes: body.resourceTypes ?? [],
        createdBy: session.shop,
        limitPerType: body.limitPerType ?? 20,
        shopifyAccessToken: session.accessToken,
      });
      if (!created?.job?.id) {
        return data({ ok: false, error: "翻译任务创建失败" }, { status: 500 });
      }
      const message = created.reusedExisting
        ? `未新建文档：该店 ${body.sourceLocale ?? "zh-CN"}→${body.targetLocale} 已有任务（id=${created.job.id}）。请在下方任务列表中查看，勿只在 Cosmos 里找「刚生成」的新 id。`
        : "翻译任务已创建";
      const cosmos = getTranslationJobsCosmosLocation();
      logTranslationCosmosTarget("action_create_job_response", {
        shop: session.shop,
        jobId: created.job.id,
        reusedExisting: created.reusedExisting,
      });
      return data({
        ok: true,
        jobId: created.job.id,
        message,
        reusedExisting: created.reusedExisting,
        cosmos: {
          ...cosmos,
          shop: session.shop,
        },
      });
    }

    return data({ ok: false, error: "不支持的 action" }, { status: 400 });
  } catch (error) {
    return data(
      {
        ok: false,
        error: error instanceof Error ? error.message : "操作失败",
      },
      { status: 500 },
    );
  }
};

export default function AppTranslation() {
  return <TranslationPage />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
