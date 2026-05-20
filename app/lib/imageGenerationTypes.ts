export type ImageGenerationJobStatus = "pending" | "succeeded" | "failed";

export type ImageGenerationHistoryItem = {
  requestId: string;
  prompt: string;
  status: ImageGenerationJobStatus;
  imageUrl: string | null;
  errorMsg: string | null;
  createdAt: string;
};

export type ImageGenerationApiResponse =
  | {
      success: true;
      requestId: string;
      status: "pending";
    }
  | {
      success: true;
      requestId: string;
      status: "succeeded";
      imageUrl: string;
    }
  | {
      success: false;
      errorCode: number;
      errorMsg: string;
      requestId?: string;
      status?: "failed";
    };

export type ImageGenerationStatusApiResponse =
  | {
      success: true;
      requestId: string;
      status: "pending";
    }
  | {
      success: true;
      requestId: string;
      status: "succeeded";
      imageUrl: string;
    }
  | {
      success: true;
      requestId: string;
      status: "failed";
      errorMsg: string;
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
