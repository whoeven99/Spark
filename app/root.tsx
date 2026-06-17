import "./styles/app.css";
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useMatches } from "react-router";
import { DEFAULT_LOCALE } from "./i18n/config";

export default function App() {
  const matches = useMatches();
  const appMatch = matches.find((match) => match.id === "routes/app");
  const lang =
    typeof appMatch?.data === "object" &&
    appMatch.data !== null &&
    "locale" in appMatch.data &&
    typeof appMatch.data.locale === "string"
      ? appMatch.data.locale
      : DEFAULT_LOCALE;

  return (
    <html lang={lang}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
