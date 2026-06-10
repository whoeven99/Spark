/**
 * GET  /api/translate/v4/shop-analysis/glossary-draft  → read draft terms
 * POST /api/translate/v4/shop-analysis/glossary-draft  → approve draft (merge/replace → live)
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import {
  readGlossaryDraft,
  bumpGlossaryVersion,
} from "../server/translation/shopAnalysis.server";
import {
  readGlossary,
  saveGlossary,
  type GlossaryTerm,
} from "../server/translation/glossary.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  try {
    const draft = await readGlossaryDraft(session.shop);
    return data({
      ok: true,
      terms: draft?.terms ?? [],
      status: draft?.status ?? null,
      generatedAt: draft?.generatedAt,
    });
  } catch (err) {
    return data({ ok: false, error: String(err) }, { status: 500 });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  if (request.method !== "POST") {
    return data({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const body = (await request.json().catch(() => ({}))) as { mode?: string };
  const mode: "merge" | "replace" = body.mode === "replace" ? "replace" : "merge";

  try {
    const draft = await readGlossaryDraft(session.shop);
    if (!draft?.terms?.length) {
      return data({ ok: false, error: "没有找到草稿术语表" }, { status: 400 });
    }

    let finalTerms: GlossaryTerm[];
    if (mode === "replace") {
      finalTerms = draft.terms;
    } else {
      const existing = await readGlossary(session.shop);
      finalTerms = mergeTerms(existing, draft.terms);
    }

    await saveGlossary(session.shop, finalTerms);
    await bumpGlossaryVersion(session.shop);

    return data({ ok: true, total: finalTerms.length, mode });
  } catch (err) {
    return data({ ok: false, error: String(err) }, { status: 500 });
  }
};

function mergeTerms(existing: GlossaryTerm[], incoming: GlossaryTerm[]): GlossaryTerm[] {
  const map = new Map(existing.map((t) => [t.source, { ...t }]));
  for (const inc of incoming) {
    const ex = map.get(inc.source);
    if (!ex) { map.set(inc.source, inc); continue; }
    if (inc.translations) ex.translations = { ...inc.translations, ...ex.translations };
    if (!ex.note && inc.note) ex.note = inc.note;
    if (inc.doNotTranslate) ex.doNotTranslate = true;
  }
  return [...map.values()];
}
