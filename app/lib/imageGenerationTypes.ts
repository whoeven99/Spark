export type ImageGenerationApiResponse =
  | {
      success: true;
      imageUrl: string;
      requestId: string;
    }
  | {
      success: false;
      errorCode: number;
      errorMsg: string;
      requestId?: string;
    };

export type ImagePromptApiResponse =
  | {
      success: true;
      prompt: string;
      requestId: string;
    }
  | {
      success: false;
      errorCode: number;
      errorMsg: string;
      requestId?: string;
    };
