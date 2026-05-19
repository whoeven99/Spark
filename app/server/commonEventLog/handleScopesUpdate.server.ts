import { getAppEntry, getSessionPrismaTableName } from "../../config/appEntry.server";
import { appendCommonEventLog } from "./appendCommonEventLog.server";
import { updateSessionScope } from "./sessionTable.server";
import { COMMON_EVENT_TYPE } from "./types.server";

type ScopesUpdatePayload = {
  current?: string[];
  previous?: string[];
};

export async function handleScopesUpdate(params: {
  shop: string;
  topic: string;
  payload: unknown;
  sessionId?: string;
}): Promise<void> {
  const shop = params.shop.trim();
  if (!shop) return;

  const body = (params.payload ?? {}) as ScopesUpdatePayload;
  const current = Array.isArray(body.current) ? body.current : [];
  const previous = Array.isArray(body.previous) ? body.previous : [];
  const scopeString = current.join(",");

  if (params.sessionId && scopeString) {
    await updateSessionScope(
      params.sessionId,
      scopeString,
      getSessionPrismaTableName(),
    );
  }

  await appendCommonEventLog({
    shop,
    appName: getAppEntry(),
    eventType: COMMON_EVENT_TYPE.SCOPES_UPDATE,
    topic: params.topic,
    referenceId: params.sessionId
      ? `scopes:${params.sessionId}:${scopeString}`
      : undefined,
    payload: { current, previous },
    metadata: { scope: scopeString },
  });
}
