import { useCallback, useEffect, useRef, useState } from "react";
import {
  OAUTH_POPUP_CHANNEL,
  readOAuthPopupStorageResult,
} from "../lib/oauthPopupBridge";

export type OAuthPopupMessage = { type?: string } & Record<string, string | undefined>;

const POPUP_WIDTH = 560;
const POPUP_HEIGHT = 680;

function buildCenteredPopupFeatures() {
  if (typeof window === "undefined") {
    return `popup,width=${POPUP_WIDTH},height=${POPUP_HEIGHT},resizable=yes`;
  }

  const screenLeft = typeof window.screenLeft === "number" ? window.screenLeft : window.screenX;
  const screenTop = typeof window.screenTop === "number" ? window.screenTop : window.screenY;
  const viewportWidth = window.outerWidth || window.innerWidth || POPUP_WIDTH;
  const viewportHeight = window.outerHeight || window.innerHeight || POPUP_HEIGHT;
  const left = Math.max(screenLeft + Math.round((viewportWidth - POPUP_WIDTH) / 2), 0);
  const top = Math.max(screenTop + Math.round((viewportHeight - POPUP_HEIGHT) / 2), 0);

  return [
    "popup",
    `width=${POPUP_WIDTH}`,
    `height=${POPUP_HEIGHT}`,
    `left=${left}`,
    `top=${top}`,
    "resizable=yes",
  ].join(",");
}

/** 在 OAuth 授权 URL 上追加 popup=1，供 callback 识别弹窗模式。 */
export function withOAuthPopupParam(url: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}popup=1`;
}

/**
 * 在用户点击时同步打开弹窗，再拉取 auth URL 并导航到授权页。
 * 授权完成后由 callback 页 postMessage 回传结果。
 */
export function useOAuthPopup(messageType: string) {
  const popupRef = useRef<Window | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const onCompleteRef = useRef<((data: OAuthPopupMessage) => void) | null>(null);

  useEffect(() => {
    const consume = (data: OAuthPopupMessage | null | undefined) => {
      if (!data || data.type !== messageType) return false;
      popupRef.current = null;
      setRedirecting(false);
      onCompleteRef.current?.(data);
      onCompleteRef.current = null;
      return true;
    };

    const handleMessage = (event: MessageEvent) => {
      consume(event.data as OAuthPopupMessage | null);
    };
    window.addEventListener("message", handleMessage);

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(OAUTH_POPUP_CHANNEL);
      channel.onmessage = (event) => {
        const data = event.data as OAuthPopupMessage | null;
        if (!consume(data)) return;
        window.postMessage(data, "*");
      };
    }

    return () => {
      window.removeEventListener("message", handleMessage);
      channel?.close();
    };
  }, [messageType]);

  useEffect(() => {
    if (!redirecting) return;
    const timer = setInterval(() => {
      if (!popupRef.current?.closed) return;
      clearInterval(timer);
      popupRef.current = null;
      setRedirecting(false);
      const onComplete = onCompleteRef.current;
      if (!onComplete) return;
      onCompleteRef.current = null;
      const stored = readOAuthPopupStorageResult(messageType);
      if (stored) {
        window.postMessage(stored, "*");
      }
      onComplete(stored ?? { type: messageType });
    }, 500);
    return () => clearInterval(timer);
  }, [messageType, redirecting]);

  const startOAuth = useCallback(
    async (
      authUrlEndpoint: string,
      onComplete?: (data: OAuthPopupMessage) => void,
    ): Promise<void> => {
      onCompleteRef.current = onComplete ?? null;
      setRedirecting(true);

      const popup =
        typeof window !== "undefined"
          ? window.open(
              "about:blank",
              `oauth_${messageType}`,
              buildCenteredPopupFeatures(),
            )
          : null;
      popupRef.current = popup;

      try {
        const resp = await fetch(withOAuthPopupParam(authUrlEndpoint), {
          headers: { Accept: "application/json" },
        });
        const data = (await resp.json().catch(() => ({}))) as {
          ok?: boolean;
          authUrl?: string;
          error?: string;
        };
        if (!resp.ok || !data.authUrl) {
          setRedirecting(false);
          try {
            popup?.close();
          } catch {
            // ignore
          }
          popupRef.current = null;
          onCompleteRef.current = null;
          throw new Error(data.error ?? "Authorization failed");
        }
        if (popup && !popup.closed) {
          popup.location.href = data.authUrl;
        } else {
          window.open(data.authUrl, "_top");
          setRedirecting(false);
          onCompleteRef.current = null;
        }
      } catch (error) {
        setRedirecting(false);
        try {
          popup?.close();
        } catch {
          // ignore
        }
        popupRef.current = null;
        onCompleteRef.current = null;
        throw error;
      }
    },
    [messageType],
  );

  return { startOAuth, redirecting };
}
