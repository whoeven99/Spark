const FAVICON_CACHE_CONTROL = "public, max-age=86400";

/** Browsers request /favicon.ico by default; avoid noisy 404s in SSR logs. */
export function loader() {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": FAVICON_CACHE_CONTROL,
    },
  });
}
