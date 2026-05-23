import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { TRANSLATION_V4_MODULES } from "../server/translation/v4/types";
// @ts-expect-error IDE 对该模块存在暂时性解析延迟，运行时路径有效
import { TranslationV4Page } from "./page/TranslationV4Page";
import { listV4Jobs } from "../server/translation/v4/cosmosV4Store.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const jobs = await listV4Jobs(session.shop, 30);
  return data({
    shop: session.shop,
    jobs,
    modules: [...TRANSLATION_V4_MODULES],
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  return data({ ok: false, error: "use /api/translate/v4/tasks" }, { status: 400 });
};

export default function AppTranslationV4() {
  return <TranslationV4Page />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
