import {
  getMetaCredential,
  maskToken,
  setMetaCredential,
} from "./adAuthCredentialStore.server";

export type AdProvider = "meta";

type CredentialRecord = {
  clientId: string;
  clientSecret: string;
  updatedAt: string;
};

export async function setAdProviderCredential(
  shop: string,
  provider: AdProvider,
  clientId: string,
  clientSecret: string,
) {
  if (provider !== "meta") return;
  await setMetaCredential(shop, clientId, clientSecret);
}

export async function getAdProviderCredential(shop: string, provider: AdProvider) {
  if (provider !== "meta") return null;
  return (await getMetaCredential(shop)) as CredentialRecord | null;
}

export function maskClientId(clientId: string) {
  return maskToken(clientId);
}

