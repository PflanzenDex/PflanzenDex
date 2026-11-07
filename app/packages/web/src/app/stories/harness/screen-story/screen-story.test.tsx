// @vitest-environment jsdom
import { useQuery } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/shared/data";
import { POLL_MS, SETTLE_BUDGET_MS, warm } from "./screen-story";

/** Safety stop for the fake clock: far beyond the budget, so a loop that never ends fails the test instead of hanging. */
const MAX_STEPS = 10_000;

/** A screen whose data comes from `request`: it stays in its loading state until the request settles. */
function waitingScreen(request: () => Promise<unknown>) {
  const Waiting = () => {
    const { data } = useQuery({ queryKey: ["fr-qg-03"], queryFn: request });
    return <p>{data === undefined ? "waiting" : "ready"}</p>;
  };
  return <Waiting />;
}

/** A request that resolves after `ms` of fake time, the way a request of a real screen takes time. */
const answerAfter = (ms: number) => () =>
  new Promise<string>((resolve) => setTimeout(() => resolve("done"), ms));

/**
 * Moves the fake clock one poll at a time until the warm-up settles or fails. Each step is `POLL_MS`, so one step is one
 * poll of the harness, and the elapsed time of the fake clock is the time the harness really waited.
 */
async function runPolls(settling: Promise<unknown>): Promise<void> {
  let done = false;
  void settling.then(
    () => {
      done = true;
    },
    () => {
      done = true;
    },
  );
  for (let step = 0; !done && step < MAX_STEPS; step++) {
    await vi.advanceTimersByTimeAsync(POLL_MS);
  }
  if (!done) throw new Error("The fake clock ran out of steps before the warm-up settled");
}

describe("FR-QG-03 · page story waits for a time budget, not for a count of polls", () => {
  beforeEach(() => {
    // Only the timers the harness polls with and the clock it reads: nothing waits on real time.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("FR-QG-03 · a screen whose data arrives after 4 s loads: at 10 ms per poll that is 400 polls, more than the old limit of 300", async () => {
    const warming = warm(createQueryClient(), "/today", waitingScreen(answerAfter(4_000)));
    await runPolls(warming);
    const unmount = await warming;
    unmount();
  });

  it("FR-QG-03 · a screen that never loads gives up only after the time budget, and the error names the path, the elapsed time and the polls", async () => {
    const started = performance.now();
    const warming = warm(
      createQueryClient(),
      "/today",
      waitingScreen(() => new Promise(() => undefined)),
    );
    await runPolls(warming);
    const failure = await warming.then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(performance.now() - started).toBeGreaterThanOrEqual(SETTLE_BUDGET_MS);
    expect((failure as Error).message).toMatch(
      /^The screen \/today did not finish loading: \d+ ms and \d+ polls/,
    );
  });
});
