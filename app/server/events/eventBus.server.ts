import type { AppEvent, EventHandler } from "./types.server";

const LOG = "[EventBus]";

export class EventBus {
  private readonly handlers = new Map<string, EventHandler[]>();

  on(eventName: string, handler: EventHandler): void {
    const list = this.handlers.get(eventName) ?? [];
    list.push(handler);
    this.handlers.set(eventName, list);
  }

  async publish(event: AppEvent): Promise<void> {
    const handlers = this.handlers.get(event.eventName) ?? [];
    if (handlers.length === 0) {
      console.info(`${LOG} publish ${event.eventName} (no handlers)`);
      return;
    }

    console.info(
      `${LOG} publish ${event.eventName} handlers=${handlers.length}`,
    );

    const results = await Promise.allSettled(
      handlers.map((handler, index) => {
        const handlerStartedAt = Date.now();
        console.info(
          `${LOG} handler-start event=${event.eventName} index=${index}`,
        );
        return Promise.resolve(handler(event)).then(
          (value) => {
            console.info(
              `${LOG} handler-done event=${event.eventName} index=${index} elapsedMs=${Date.now() - handlerStartedAt}`,
            );
            return value;
          },
          (reason) => {
            console.error(
              `${LOG} handler-done event=${event.eventName} index=${index} elapsedMs=${Date.now() - handlerStartedAt} status=rejected`,
              reason,
            );
            throw reason;
          },
        );
      }),
    );

    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<void> =>
        result.status === "fulfilled",
    );

    console.info(
      `${LOG} publish-complete event=${event.eventName} fulfilled=${fulfilled.length} rejected=${rejected.length}`,
    );

    for (const result of rejected) {
      console.error(
        `${LOG} handler failed event=${event.eventName}`,
        result.reason,
      );
    }

    if (rejected.length > 0) {
      throw rejected[0]!.reason;
    }
  }
}

export const eventBus = new EventBus();
