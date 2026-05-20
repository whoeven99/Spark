import { eventBus } from "./eventBus.server";
import { APP_INSTALLED_EVENT } from "./install/appInstalledEvent.server";
import { handleAppInstalledEmail } from "./install/appInstalledHandlers.server";
import { APP_UNINSTALLED_EVENT } from "./uninstall/appUninstalledEvent.server";
import { handleAppUninstalledOrchestrated } from "./uninstall/appUninstalledHandlers.server";

let registered = false;

export function registerAppEventHandlers(): void {
  eventBus.on(APP_INSTALLED_EVENT, (event) =>
    handleAppInstalledEmail(event as Parameters<typeof handleAppInstalledEmail>[0]),
  );

  eventBus.on(APP_UNINSTALLED_EVENT, (event) =>
    handleAppUninstalledOrchestrated(
      event as Parameters<typeof handleAppUninstalledOrchestrated>[0],
    ),
  );
}

export function ensureAppEventHandlersRegistered(): void {
  if (registered) return;
  registered = true;
  registerAppEventHandlers();
  console.info("[EventBus] handlers registered");
}

/** 仅测试：重置注册状态 */
export function resetAppEventHandlersForTests(): void {
  registered = false;
}
