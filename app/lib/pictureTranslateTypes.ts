export type PictureTranslateImageSource = "upload" | "url" | "product";

export type PictureTranslateLanguageOption = {
  value: string;
  label: string;
};

export type PictureTranslateResultMeta = {
  imageSource: PictureTranslateImageSource;
  imageSourceLabel: string;
  sourceLanguage: string;
  sourceLanguageLabel: string;
  targetLanguage: string;
  targetLanguageLabel: string;
  originalImageUrl?: string;
};

export type PictureTranslateChatResponse = {
  success?: unknown;
  translatedImage?: unknown;
  error?: unknown;
  requestId?: unknown;
};
