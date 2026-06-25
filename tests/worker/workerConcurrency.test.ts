import { afterEach, describe, expect, it } from "vitest";
import { StageConcurrencyGate } from "../../worker/src/services/workerConcurrency.js";

describe("StageConcurrencyGate", () => {
  const prev = process.env.TRANSLATE_JOB_CONCURRENCY;

  afterEach(() => {
    if (prev === undefined) delete process.env.TRANSLATE_JOB_CONCURRENCY;
    else process.env.TRANSLATE_JOB_CONCURRENCY = prev;
  });

  it("blocks when at capacity and releases slots", () => {
    const gate = new StageConcurrencyGate(2);
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(false);
    gate.release();
    expect(gate.tryAcquire()).toBe(true);
    gate.release();
    gate.release();
    expect(gate.inflight).toBe(0);
  });

  it("hasCapacity reflects inflight count", () => {
    const gate = new StageConcurrencyGate(1);
    expect(gate.hasCapacity()).toBe(true);
    gate.tryAcquire();
    expect(gate.hasCapacity()).toBe(false);
    gate.release();
    expect(gate.hasCapacity()).toBe(true);
  });
});
