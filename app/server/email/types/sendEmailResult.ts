import type { EmailError } from "./emailError";

export type SendEmailSuccess = {
  ok: true;
  requestId: string;
  provider: string;
};

export type SendEmailFailure = {
  ok: false;
  error: EmailError;
};

export type SendEmailResult = SendEmailSuccess | SendEmailFailure;
