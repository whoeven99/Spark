export function maskEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim();
  if (!trimmed || !trimmed.includes("@")) return null;
  const [local, domain] = trimmed.split("@");
  if (!local || !domain) return null;
  return `${local.slice(0, 1)}***@${domain}`;
}

export function shopHandle(shop: string): string {
  return shop.replace(/\.myshopify\.com$/i, "");
}

export function formatUtcNow(): string {
  const iso = new Date().toISOString();
  return `${iso.slice(0, 16).replace("T", " ")} UTC`;
}
