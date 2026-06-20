/** Fields eligible for translationsRegister (aligned across writeback + verify). */
export type WritebackField = {
  key: string;
  originalValue?: string | null;
  translatedValue?: string | null;
  value?: string | null;
};

/**
 * Shopify rejects registering a handle translation whose value equals the
 * resource's default-locale handle ("already taken as a handle"). Skip those,
 * but still write other fields even when translatedValue === originalValue
 * (brand terms / glossary).
 */
export function filterWritebackFields<T extends WritebackField>(fields: T[]): T[] {
  return fields.filter((t) => {
    const translated = (t.translatedValue ?? t.value ?? "").trim();
    if (!translated) return false;
    const original = (t.originalValue ?? "").trim();
    if (t.key === "handle" && translated === original) return false;
    return true;
  });
}
