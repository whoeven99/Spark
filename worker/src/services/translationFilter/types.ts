export type TranslatableContentInput = {
  key: string;
  value: string;
  type?: string | null;
};

export type ExistingTranslation = {
  key: string;
  value?: string | null;
  outdated?: boolean | null;
};

export type IncludeFieldOptions = {
  isCover: boolean;
  isHandle: boolean;
};

export type IncludeFieldV2Context = IncludeFieldOptions & {
  module: string;
};
