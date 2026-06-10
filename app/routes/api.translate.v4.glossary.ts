import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import {
  importGlossaryCsv,
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

/** PUT / POST /api/translate/v4/glossary */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  if (!isGlossaryBlobConfigured()) {
    return data({ ok: false, error: "Blob 存储未配置" }, { status: 503 });
  }

  if (request.method === "PUT") {
    const body = (await request.json().catch(() => ({}))) as { terms?: unknown };
    try {
      const terms = validateGlossaryTerms(body.terms);
      const count = await saveGlossary(session.shop, terms);
      return data({ ok: true, count });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return data({ ok: false, error: msg }, { status: 400 });
    }
  }

  if (request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as {
      csv?: string;
      mode?: "merge" | "replace";
    };
    const csv = body.csv?.trim() ?? "";
    if (!csv) return data({ ok: false, error: "请提供 CSV 内容" }, { status: 400 });
    const mode = body.mode === "replace" ? "replace" : "merge";
    try {
      const result = await importGlossaryCsv(session.shop, csv, mode);
      return data({ ok: true, ...result, mode });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return data({ ok: false, error: msg }, { status: 400 });
    }
  }

  return data({ ok: false, error: "Method not allowed" }, { status: 405 });
};
