import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_WORKER_URL, registerAppWorker } from "./register";

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
