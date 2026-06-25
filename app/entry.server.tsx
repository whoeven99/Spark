import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { type EntryContext } from "react-router";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";
import {
  braceletProxyPageLoader,
  braceletProxyPrepareAction,
} from "./server/bracelet/braceletProxyHandlers.server";

export const streamTimeout = 5000;

/** Shopify App Proxy 可能打到 /a/... 或 application_url 下的 /app/a/... */
async function tryBraceletAppProxyResponse(
  request: Request,
): Promise<Response | null> {
  const url = new URL(request.url);
  const isBraceletPage =
    url.pathname === "/a/ciwi-spark" || url.pathname === "/app/a/ciwi-spark";
  const isBraceletPrepare =
    url.pathname === "/a/ciwi-spark/prepare" ||
    url.pathname === "/app/a/ciwi-spark/prepare";

  if (isBraceletPage && request.method === "GET") {
    return braceletProxyPageLoader(request, "/a/ciwi-spark/prepare");
  }
  if (isBraceletPrepare && request.method === "POST") {
    return braceletProxyPrepareAction(request);
  }
  return null;
}

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext
) {
  const proxyResponse = await tryBraceletAppProxyResponse(request);
  if (proxyResponse) {
    return proxyResponse;
  }

  addDocumentResponseHeaders(request, responseHeaders);
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? '')
    ? "onAllReady"
    : "onShellReady";

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter
        context={reactRouterContext}
        url={request.url}
      />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        },
      }
    );

    // Automatically timeout the React renderer after 6 seconds, which ensures
    // React has enough time to flush down the rejected boundary contents
    setTimeout(abort, streamTimeout + 1000);
  });
}
