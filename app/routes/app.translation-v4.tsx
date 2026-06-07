import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { fetchShopLocalesPayload } from "../server/productImprove/shopLocalesFetcher.server";
import { TRANSLATION_V4_MODULES } from "../server/translation/v4/types";
import { TranslationV4Page } from "./page/TranslationV4Page";
import { listV4Jobs } from "../server/translation/v4/cosmosV4Store.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const [jobs, shopLocales] = await Promise.all([
    listV4Jobs(session.shop, 30),
    fetchShopLocalesPayload(admin, `translation-v4 shop=${session.shop}`),
  ]);
  return data({
    shop: session.shop,
    jobs,
    modules: [...TRANSLATION_V4_MODULES],
    shopLocales,
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
