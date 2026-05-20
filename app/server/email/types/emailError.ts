export const EMAIL_ERROR_CODES = {
  MISSING_CREDENTIALS: "EMAIL_MISSING_CREDENTIALS",
  EMAIL_DISABLED: "EMAIL_DISABLED",
  VALIDATION_FAILED: "EMAIL_VALIDATION_FAILED",
  TENCENT_SEND_FAILED: "tencent-send-failed",
  PROVIDER_NOT_FOUND: "EMAIL_PROVIDER_NOT_FOUND",
  UNKNOWN: "EMAIL_UNKNOWN",
} as const;

export type EmailErrorCode =
  (typeof EMAIL_ERROR_CODES)[keyof typeof EMAIL_ERROR_CODES];

export type EmailError = {
  code: EmailErrorCode;
  message: string;
  provider: string;
  cause?: unknown;
};

export function createEmailError(params: {
  code: EmailErrorCode;
  message: string;
  provider: string;
  cause?: unknown;
}): EmailError {
  return {
    code: params.code,
    message: params.message,
    provider: params.provider,
    cause: params.cause,
  };
}
