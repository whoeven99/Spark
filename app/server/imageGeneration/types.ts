export type ImageGenerationFailureReason =
  | "credentials_missing"
  | "prompt_invalid"
  | "openai_request_failed"
  | "openai_api_error"
  | "openai_response_parse_failed"
  | "openai_empty_image"
  | "volc_request_failed"
  | "volc_api_error"
  | "volc_response_parse_failed"
  | "volc_empty_image"
  | "blob_upload_failed"
  | "disabled";

export type ImageGenerationSuccess = {
  ok: true;
  imageUrl: string;
  blobPath: string;
  provider: "openai" | "volc";
  requestId: string;
};

export type ImageGenerationJobStatus = "pending" | "succeeded" | "failed";

export type ImageGenerationHistoryItem = {
  requestId: string;
  prompt: string;
  status: ImageGenerationJobStatus;
  imageUrl: string | null;
  errorMsg: string | null;
  createdAt: string;
};

export type ImageGenerationFailure = {
  ok: false;
  reason: ImageGenerationFailureReason;
  errorMsg: string;
  requestId: string;
};

export type ImageGenerationResult = ImageGenerationSuccess | ImageGenerationFailure;

export type ImageGenerationHttpResponse =
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

export type ImageGenerationStatusHttpResponse =
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
