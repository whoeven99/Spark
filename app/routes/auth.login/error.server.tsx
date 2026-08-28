import type { LoginError } from "@shopify/shopify-app-react-router/server";
import { LoginErrorType } from "@shopify/shopify-app-react-router/server";

interface LoginErrorMessage {
  shop?: string;
}

export function loginErrorMessage(loginErrors: LoginError): LoginErrorMessage {
  if (loginErrors?.shop === LoginErrorType.MissingShop) {
    return { shop: "Install Spark from Shopify Admin or the Shopify App Store." };
  } else if (loginErrors?.shop === LoginErrorType.InvalidShop) {
    return { shop: "This shop could not start installation. Open Spark from Shopify Admin or the App Store." };
  }

  return {};
}
