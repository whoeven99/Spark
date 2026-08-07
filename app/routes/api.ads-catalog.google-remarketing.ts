import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getGoogleAdsCredential,
  resetGoogleCustomPixelConfirmation,
} from "../server/adsCatalog/credentialStore.server";
import {
  discoverGoogleAwCandidates,
  saveGoogleRemarketingConfig,
} from "../server/adsCatalog/googleRemarketing.server";
import { generateGooglePurchaseCustomPixel } from "../lib/googleCustomPixel";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [credential, candidates] = await Promise.all([
    getGoogleAdsCredential(session.shop),
    discoverGoogleAwCandidates(session.shop).catch(() => []),
  ]);
  return Response.json({
    ok: true,
    candidates,
    config: credential?.remarketing ?? null,
    customPixelScript: credential?.remarketing
      ? generateGooglePurchaseCustomPixel({
          tagId: credential.remarketing.tagId,
          enabledFieldGroups: credential.remarketing.enabledFieldGroups,
        })
      : null,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }
  const { session, admin } = await authenticate.admin(request);
  const body = (await request.json().catch(() => null)) as
    | {
        tagId?: unknown;
        source?: unknown;
        enabledEvents?: unknown;
        enabledFieldGroups?: unknown;
        customPixelConfirmed?: unknown;
        operation?: unknown;
      }
    | null;
  if (body?.operation === "reset_custom_pixel") {
    await resetGoogleCustomPixelConfirmation(session.shop);
    return Response.json({ ok: true });
  }
  if (!body || typeof body.tagId !== "string") {
    return Response.json({ ok: false, error: "tagId is required" }, { status: 400 });
  }
  try {
    const result = await saveGoogleRemarketingConfig({
      shop: session.shop,
      admin,
      tagId: body.tagId,
      source: body.source === "manual" ? "manual" : "auto",
      enabledEvents: body.enabledEvents,
      enabledFieldGroups: body.enabledFieldGroups,
      customPixelConfirmed: body.customPixelConfirmed === true,
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    );
  }
};
