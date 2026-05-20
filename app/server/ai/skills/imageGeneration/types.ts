export type GenerateProductImageToolSuccess = {
  success: true;
  imageUrl: string;
  requestId: string;
};

export type GenerateProductImageToolFailure = {
  success: false;
  error: string;
  requestId: string;
};

export type GenerateProductImageToolResult =
  | GenerateProductImageToolSuccess
  | GenerateProductImageToolFailure;
