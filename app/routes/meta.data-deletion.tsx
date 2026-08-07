import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  handleMetaDataDeletionRequest,
  handleMetaDataDeletionStatus,
} from "../server/adsCatalog/metaDataDeletion.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method !== "GET") {
    return new Response(null, { status: 405 });
  }
  return handleMetaDataDeletionStatus(request);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }
  return handleMetaDataDeletionRequest(request);
};
