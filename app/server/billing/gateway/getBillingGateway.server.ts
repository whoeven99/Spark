import { useNoopBillingGateway } from "../constants.server";
import type { BillingGateway } from "./billingGateway.types";
import { noopBillingGateway } from "./noopBillingGateway.server";
import { shopifyBillingGateway } from "./shopifyBillingGateway.server";

export function getBillingGateway(): BillingGateway {
  if (useNoopBillingGateway()) {
    return noopBillingGateway;
  }
  return shopifyBillingGateway;
}
