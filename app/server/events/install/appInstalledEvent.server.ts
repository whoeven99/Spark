import type { AppEvent } from "../types.server";

export const APP_INSTALLED_EVENT = "AppInstalled" as const;

export type AppInstalledEventPayload = {
  shop: string;
  sessionId: string;
  appName: string;
  source?: string;
  scope?: string | null;
  isOnline?: boolean | null;
  installedAt: Date;
};

export class AppInstalledEvent implements AppEvent {
  readonly eventName = APP_INSTALLED_EVENT;

  readonly shop: string;
  readonly sessionId: string;
  readonly appName: string;
  readonly source?: string;
  readonly scope?: string | null;
  readonly isOnline?: boolean | null;
  readonly installedAt: Date;

  constructor(payload: AppInstalledEventPayload) {
    this.shop = payload.shop;
    this.sessionId = payload.sessionId;
    this.appName = payload.appName;
    this.source = payload.source;
    this.scope = payload.scope;
    this.isOnline = payload.isOnline;
    this.installedAt = payload.installedAt;
  }
}
