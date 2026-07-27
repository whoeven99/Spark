import type { ActionFunctionArgs } from "react-router";
import { handleAdsCatalogSyncAction } from "../server/adsCatalog/adsCatalogRoute.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  return handleAdsCatalogSyncAction(request);
};
