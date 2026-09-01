export type OpsEmailLocale = "zh-CN" | "en";

export type OpsEmailTemplate = {
  key: string;
  templateId: number;
  event: string;
  locale: OpsEmailLocale;
  label: string;
  subject: string;
  htmlFile: string;
};

export type OpsEmailAudienceRow = {
  shop: string;
  email: string | null;
  emailMasked: string | null;
  recipientName: string | null;
  locale: string | null;
  planKey: string | null;
  subStatus: string | null;
  installed: boolean;
  sparkInstalled: boolean;
  lastSentAt: string | null;
  lastSentStatus: string | null;
};

export type OpsEmailSendStatus = "sent" | "failed" | "skipped";

export type OpsEmailSendResult = {
  shop: string;
  emailMasked: string | null;
  status: OpsEmailSendStatus;
  error?: string;
  requestId?: string;
};
