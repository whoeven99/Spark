import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import {
  isGlossaryBlobConfigured,
  readGlossary,
  saveGlossary,
  validateGlossaryTerms,
} from "../server/translation/glossary.server";

/** GET /api/translate/v4/glossary */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  if (!isGlossaryBlobConfigured()) {
    return data({ ok: true, terms: [], note: "Blob 存储未配置" });
  }
  const terms = await readGlossary(session.shop);
  return data({ ok: true, terms });
};

/** PUT /api/translate/v4/glossary */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  if (!isGlossaryBlobConfigured()) {
    return data({ ok: false, error: "Blob 存储未配置" }, { status: 503 });
  }

  if (request.method !== "PUT") {
    return data({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const body = (await request.json().catch(() => ({}))) as { terms?: unknown };
  try {
    const terms = validateGlossaryTerms(body.terms);
    const count = await saveGlossary(session.shop, terms);
    return data({ ok: true, count });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return data({ ok: false, error: msg }, { status: 400 });
  }
};
