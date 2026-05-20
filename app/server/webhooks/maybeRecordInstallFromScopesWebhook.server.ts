import { recordAppInstalled } from "../commonEventLog/recordAppInstalled.server";

type ScopesUpdatePayload = {
  current?: string[];
  previous?: string[];
};

/**
 * Shopify 无 app/installed webhook。首次 scope 授权（previous 为空、current 非空）时补充记录安装。
 */
export async function maybeRecordInstallFromScopesWebhook(params: {
  shop: string;
  payload: unknown;
  sessionId?: string;
}): Promise<void> {
  const body = (params.payload ?? {}) as ScopesUpdatePayload;
  const current = Array.isArray(body.current) ? body.current : [];
  const previous = Array.isArray(body.previous) ? body.previous : [];
  const isFirstScopeGrant = previous.length === 0 && current.length > 0;

  if (!isFirstScopeGrant) {
    console.info(
      `[Webhook] app/scopes_update skip install-record shop=${params.shop} previousCount=${previous.length} currentCount=${current.length}`,
    );
    return;
  }

  if (!params.sessionId) {
    console.warn(
      `[Webhook] app/scopes_update first scope grant but no sessionId shop=${params.shop}`,
    );
    return;
  }

  console.info(
    `[Webhook] app/scopes_update triggering recordAppInstalled shop=${params.shop} source=scopes_update_webhook`,
  );

  await recordAppInstalled({
    shop: params.shop,
    sessionId: params.sessionId,
    scope: current.join(","),
    isOnline: false,
    source: "scopes_update_webhook",
  });
}
