import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../../../../app/server/events/eventBus.server";
import type { AppEvent } from "../../../../app/server/events/types.server";

class TestEvent implements AppEvent {
  readonly eventName = "TestEvent";
}

describe("EventBus", () => {
  it("runs all handlers for an event", async () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on("TestEvent", a);
    bus.on("TestEvent", b);

    await bus.publish(new TestEvent());

    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it("rethrows when a handler rejects after others ran", async () => {
    const bus = new EventBus();
    const ok = vi.fn();
    bus.on("TestEvent", async () => {
      throw new Error("handler boom");
    });
    bus.on("TestEvent", ok);

    await expect(bus.publish(new TestEvent())).rejects.toThrow("handler boom");
    expect(ok).toHaveBeenCalledOnce();
  });

  it("no-ops when no handlers registered", async () => {
    const bus = new EventBus();
    await expect(bus.publish(new TestEvent())).resolves.toBeUndefined();
  });
});
