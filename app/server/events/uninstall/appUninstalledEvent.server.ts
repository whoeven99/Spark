import type { AppEvent } from "../types.server";

export const APP_UNINSTALLED_EVENT = "AppUninstalled" as const;

export type AppUninstalledEventPayload = {
  shop: string;
  topic: string;
  payload: unknown;
  sessionId?: string;
  appName: string;
  uninstalledAt: Date;
};

export class AppUninstalledEvent implements AppEvent {
  readonly eventName = APP_UNINSTALLED_EVENT;

  readonly shop: string;
  readonly topic: string;
  readonly payload: unknown;
  readonly sessionId?: string;
  readonly appName: string;
  readonly uninstalledAt: Date;

  constructor(params: AppUninstalledEventPayload) {
    this.shop = params.shop;
    this.topic = params.topic;
    this.payload = params.payload;
    this.sessionId = params.sessionId;
    this.appName = params.appName;
    this.uninstalledAt = params.uninstalledAt;
  }
}
