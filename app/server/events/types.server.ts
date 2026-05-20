/** 进程内领域事件基类。 */
export interface AppEvent {
  readonly eventName: string;
}

export type EventHandler<T extends AppEvent = AppEvent> = (
  event: T,
) => void | Promise<void>;
