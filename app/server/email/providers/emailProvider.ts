import type { SendEmailRequest } from "../types/sendEmailRequest";
import type { SendEmailResult } from "../types/sendEmailResult";

export interface EmailProvider {
  readonly name: string;
  send(request: SendEmailRequest): Promise<SendEmailResult>;
}
