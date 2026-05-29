import type { AITaskSSEEvent } from "../../lib/aiTaskTypes";

export type AITaskEventCallback = (event: AITaskSSEEvent) => void;

const registry = new Map<string, Set<AITaskEventCallback>>();

export function subscribeToTask(
  taskId: string,
  callback: AITaskEventCallback,
): () => void {
  let subscribers = registry.get(taskId);
  if (!subscribers) {
    subscribers = new Set();
    registry.set(taskId, subscribers);
  }
  subscribers.add(callback);
  return () => {
    const set = registry.get(taskId);
    if (!set) return;
    set.delete(callback);
    if (set.size === 0) registry.delete(taskId);
  };
}

export function emitTaskEvent(taskId: string, event: AITaskSSEEvent): void {
  const subscribers = registry.get(taskId);
  if (!subscribers || subscribers.size === 0) return;
  for (const cb of subscribers) {
    try {
      cb(event);
    } catch (e) {
      console.error(`[AITaskEventBus] callback error for taskId=${taskId}`, e);
    }
  }
}

export function clearTaskSubscribers(taskId: string): void {
  registry.delete(taskId);
}

export function subscriberCount(taskId: string): number {
  return registry.get(taskId)?.size ?? 0;
}
