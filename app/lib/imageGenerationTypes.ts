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
