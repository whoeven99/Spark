import { useCallback, useEffect, useRef, useState } from "react";

export type OAuthPopupMessage = { type?: string } & Record<string, string | undefined>;

const POPUP_FEATURES = "popup,width=560,height=680,resizable=yes";

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
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as OAuthPopupMessage | null;
      if (!data || data.type !== messageType) return;

      popupRef.current = null;
      setRedirecting(false);
      onCompleteRef.current?.(data);
      onCompleteRef.current = null;
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [messageType]);

  useEffect(() => {
    if (!redirecting) return;
    const timer = setInterval(() => {
      if (popupRef.current?.closed) {
        clearInterval(timer);
        popupRef.current = null;
        setRedirecting(false);
        // Some OAuth providers can sever window.opener during navigation. In
        // that case the callback page cannot postMessage back, but it still
        // closes the popup after completing server-side work. Let callers
        // re-read their server state as a fallback.
        const onComplete = onCompleteRef.current;
        onCompleteRef.current = null;
        onComplete?.({ type: messageType });
      }
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
          ? window.open("about:blank", `oauth_${messageType}`, POPUP_FEATURES)
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
