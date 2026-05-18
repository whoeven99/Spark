export type PictureTranslateToolInput = {
  imageUrl?: string;
  imageBase64?: string;
  targetLanguage: string;
  sourceLanguage?: string;
};

export type PictureTranslateTextBlock = {
  sourceText: string;
  translatedText: string;
  position: number[];
};

export type PictureTranslateToolSuccess = {
  success: true;
  translatedImage: string;
  textBlocks: PictureTranslateTextBlock[];
};

export type PictureTranslateToolFailure = {
  success: false;
  error: string;
};

export type PictureTranslateToolResult =
  | PictureTranslateToolSuccess
  | PictureTranslateToolFailure;

export type PictureTranslateResolvedInput = {
  imageUrl?: string;
  imageBase64?: string;
  targetLanguage: string;
  sourceLanguage: string;
};

export type PictureTranslateInputSummary = {
  hasImageUrl: boolean;
  imageUrlHost?: string;
  hasImageBase64: boolean;
  imageBase64Length: number;
  targetLanguage: string;
  sourceLanguage: string;
};
