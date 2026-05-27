/** Aligns with Spring TranslateV3Service.shouldStoreContent */

const NON_TRANSLATABLE_TYPES = new Set([
  "FILE_REFERENCE",
  "LINK",
  "URL",
  "LIST_FILE_REFERENCE",
  "LIST_LINK",
  "LIST_URL",
  "JSON_STRING",
]);

export type TranslatableContentInput = {
  key: string;
  value: string;
  type?: string | null;
};

export type ExistingTranslation = {
  key: string;
  outdated?: boolean | null;
};

export type IncludeFieldOptions = {
  isCover: boolean;
  isHandle: boolean;
};

export function shouldIncludeField(
  content: TranslatableContentInput,
  translations: ExistingTranslation[] | undefined,
  opts: IncludeFieldOptions,
): boolean {
  const value = content.value;
  if (!value?.trim()) {
    return false;
  }

  const type = content.type ?? "";
  const key = content.key;

  if (NON_TRANSLATABLE_TYPES.has(type)) {
    return false;
  }

  if (type === "URI" && key === "handle" && !opts.isHandle) {
    return false;
  }

  if (!opts.isCover && translations?.length) {
    const keyTranslation = translations.find((t) => key != null && key === t.key);
    if (keyTranslation != null && keyTranslation.outdated === false) {
      return false;
    }
  }

  return true;
}
