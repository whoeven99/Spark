import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getGoogleAdsCredential,
  resetGoogleCustomPixelConfirmation,
} from "../server/adsCatalog/credentialStore.server";
import {
  discoverGoogleAwCandidates,
  saveGoogleRemarketingConfig,
  setupGooglePixel,
} from "../server/adsCatalog/googleRemarketing.server";
import { generateGooglePurchaseCustomPixel } from "../lib/googleCustomPixel";
import {
  isGooglePixelSetupEvent,
  listActivePixelSetupEvents,
  resolveEventConversionLabel,
} from "../lib/googlePixelEvents";

function defaultEventLabel(event: string): string {
  switch (event) {
    case "page_view":
      return "Page View";
    case "add_to_cart":
      return "Add to Cart";
    case "begin_checkout":
      return "Begin Checkout";
    case "purchase":
      return "Purchase";
    case "add_payment_info":
      return "Payment Info Submitted";
    default:
      return event;
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [credential, candidates] = await Promise.all([
    getGoogleAdsCredential(session.shop),
    discoverGoogleAwCandidates(session.shop).catch(() => []),
  ]);
  const remarketing = credential?.remarketing;
  const purchaseLabel = remarketing
    ? resolveEventConversionLabel(
        remarketing.eventConversions,
        "purchase",
        remarketing.conversionLabel,
      )
    : "";
  return Response.json({
    ok: true,
    candidates,
    config: remarketing ?? null,
    customPixelScript: remarketing
      ? generateGooglePurchaseCustomPixel({
          tagId: remarketing.tagId,
          enabledFieldGroups: remarketing.enabledFieldGroups,
          conversionLabel: purchaseLabel,
          enhancedConversions: remarketing.enhancedConversions,
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
        pixelName?: unknown;
        conversionLabel?: unknown;
        enhancedConversions?: unknown;
        customPixelConfirmed?: unknown;
        operation?: unknown;
        selectedEvents?: unknown;
        event?: unknown;
        disabled?: unknown;
      }
    | null;

  if (body?.operation === "reset_custom_pixel") {
    await resetGoogleCustomPixelConfirmation(session.shop);
    return Response.json({ ok: true });
  }

  if (body?.operation === "setup") {
    try {
      const result = await setupGooglePixel({
        shop: session.shop,
        admin,
        pixelName: typeof body.pixelName === "string" ? body.pixelName : "",
        selectedEvents: body.selectedEvents,
        enhancedConversions:
          typeof body.enhancedConversions === "boolean"
            ? body.enhancedConversions
            : undefined,
        labelOf: (event) => defaultEventLabel(event),
      });
      const purchaseLabel = resolveEventConversionLabel(
        result.config.eventConversions,
        "purchase",
        result.config.conversionLabel,
      );
      return Response.json({
        ok: true,
        ...result,
        customPixelScript: listActivePixelSetupEvents({
          enabledEvents: [
            ...result.config.enabledEvents,
            ...(result.config.eventConversions?.purchase ? ["purchase"] : []),
          ],
          eventConversions: result.config.eventConversions,
        }).includes("purchase")
          ? generateGooglePurchaseCustomPixel({
              tagId: result.config.tagId,
              enabledFieldGroups: result.config.enabledFieldGroups,
              conversionLabel: purchaseLabel,
              enhancedConversions: result.config.enhancedConversions,
            })
          : null,
      });
    } catch (error) {
      return Response.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        },
        { status: 400 },
      );
    }
  }

  if (body?.operation === "toggle_event") {
    const event = typeof body.event === "string" ? body.event : "";
    if (!isGooglePixelSetupEvent(event)) {
      return Response.json({ ok: false, error: "无效的事件类型" }, { status: 400 });
    }
    const credential = await getGoogleAdsCredential(session.shop);
    const remarketing = credential?.remarketing;
    if (!remarketing) {
      return Response.json({ ok: false, error: "尚未配置 Google Pixel" }, { status: 400 });
    }
    const disabled = body.disabled === true;
    const eventConversions = { ...(remarketing.eventConversions ?? {}) };
    const current = eventConversions[event];
    if (current) {
      eventConversions[event] = { ...current, disabled };
    }
    const enabledEvents = disabled
      ? remarketing.enabledEvents.filter((item) => item !== event)
      : [...new Set([...remarketing.enabledEvents, event])].filter(
          (item) => item !== "purchase",
        );
    try {
      const result = await saveGoogleRemarketingConfig({
        shop: session.shop,
        admin,
        tagId: remarketing.tagId,
        source: remarketing.source,
        enabledEvents,
        enabledFieldGroups: remarketing.enabledFieldGroups,
        pixelName: remarketing.pixelName,
        conversionLabel: remarketing.conversionLabel,
        eventConversions,
        enhancedConversions: remarketing.enhancedConversions,
        customPixelConfirmed: Boolean(remarketing.customPixelConfirmedAt),
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
  }

  if (body?.operation === "update_settings") {
    const credential = await getGoogleAdsCredential(session.shop);
    const remarketing = credential?.remarketing;
    if (!remarketing) {
      return Response.json({ ok: false, error: "尚未配置 Google Pixel" }, { status: 400 });
    }
    try {
      const result = await saveGoogleRemarketingConfig({
        shop: session.shop,
        admin,
        tagId: remarketing.tagId,
        source: remarketing.source,
        enabledEvents: remarketing.enabledEvents,
        enabledFieldGroups: remarketing.enabledFieldGroups,
        pixelName: remarketing.pixelName,
        conversionLabel: remarketing.conversionLabel,
        eventConversions: remarketing.eventConversions,
        enhancedConversions:
          typeof body.enhancedConversions === "boolean"
            ? body.enhancedConversions
            : remarketing.enhancedConversions,
        customPixelConfirmed: Boolean(remarketing.customPixelConfirmedAt),
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
      pixelName: typeof body.pixelName === "string" ? body.pixelName : undefined,
      conversionLabel:
        typeof body.conversionLabel === "string" ? body.conversionLabel : undefined,
      enhancedConversions:
        typeof body.enhancedConversions === "boolean"
          ? body.enhancedConversions
          : undefined,
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
