import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_WORKER_URL, registerAppWorker, scheduleAppWorker, type PageWindow } from "./register";

afterEach(() => {
  vi.restoreAllMocks();
});

/** A browser container whose registration answers `register`. */
const containerWith = (register: () => Promise<unknown> | unknown) =>
  ({ register }) as unknown as ServiceWorkerContainer;

describe("US-QS-27 the registration of the app's worker", () => {
  it("US-QS-27 registers the worker at /sw.js, the root of the app, when the browser has workers", async () => {
    const register = vi.fn(async () => ({ scope: "/" }));
    const result = await registerAppWorker(containerWith(register));
    expect(APP_WORKER_URL).toBe("/sw.js");
    expect(register).toHaveBeenCalledWith("/sw.js");
    expect(result).toEqual({ scope: "/" });
  });

  it("US-QS-27 does nothing and does not throw in a browser without workers", async () => {
    await expect(registerAppWorker(undefined)).resolves.toBeUndefined();
  });

  it("US-QS-27 a failed registration is written to the console and shows the keeper nothing (P-10)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await registerAppWorker(
      containerWith(async () => {
        throw new TypeError("registration refused");
      }),
    );
    expect(result).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("US-QS-27 a registration that throws at once is handled like a failed one", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await registerAppWorker(
      containerWith(() => {
        throw new Error("no workers here");
      }),
    );
    expect(result).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

/** A page for the scheduling: its load state, the load listeners and idle callbacks it got, and optionally the idle callback. */
function pageIn(readyState: DocumentReadyState, idle: boolean) {
  const loads: (() => void)[] = [];
  const idleCallbacks: (() => void)[] = [];
  const page: PageWindow = {
    document: { readyState },
    addEventListener: (_type, listener) => {
      loads.push(listener);
    },
    ...(idle
      ? {
          requestIdleCallback: (callback: () => void) => {
            idleCallbacks.push(callback);
            return 1;
          },
        }
      : {}),
  };
  return { page, loads, idleCallbacks };
}

describe("US-QS-27 the worker is registered after the page has loaded", () => {
  it("US-QS-27 a page that is still loading registers the worker only after the load, in an idle callback", () => {
    const { page, loads, idleCallbacks } = pageIn("loading", true);
    const register = vi.fn(() => undefined);
    scheduleAppWorker(page, register);
    expect(register).not.toHaveBeenCalled();
    expect(loads).toHaveLength(1);
    loads[0]?.();
    expect(register).not.toHaveBeenCalled();
    expect(idleCallbacks).toHaveLength(1);
    idleCallbacks[0]?.();
    expect(register).toHaveBeenCalledTimes(1);
  });

  it("US-QS-27 a loaded page schedules the registration at once, in an idle callback", () => {
    const { page, loads, idleCallbacks } = pageIn("complete", true);
    const register = vi.fn(() => undefined);
    scheduleAppWorker(page, register);
    expect(loads).toHaveLength(0);
    expect(idleCallbacks).toHaveLength(1);
    idleCallbacks[0]?.();
    expect(register).toHaveBeenCalledTimes(1);
  });

  it("US-QS-27 without an idle callback the registration waits one timer tick after the load", async () => {
    const { page } = pageIn("complete", false);
    const register = vi.fn(() => undefined);
    scheduleAppWorker(page, register);
    expect(register).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(register).toHaveBeenCalledTimes(1);
  });
});
