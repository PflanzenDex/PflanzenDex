import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createInstallPrompt,
  type InstallEnvironment,
  type InstallPromptEvent,
} from "./install-prompt";

// The browsers the store meets, as user agents and navigator values (US-QS-28).
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 13; OnePlus9Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_SAFARI =
  "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1";
const IPHONE_FIREFOX =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15";

type Listener = (event: Event) => void;
type BrowserOptions = {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  standalone?: boolean;
  /** The app's window shows in standalone display mode (an installed app). */
  displayStandalone?: boolean;
};

/** A browser with the window events and the navigator values the store reads; `fire` plays an event. */
function fakeBrowser(options: BrowserOptions = {}) {
  const listeners = new Map<string, Listener[]>();
  const env: InstallEnvironment = {
    addEventListener(type, listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    matchMedia: (query) => ({
      matches: options.displayStandalone === true && query === "(display-mode: standalone)",
    }),
    navigator: {
      userAgent: options.userAgent ?? ANDROID_CHROME,
      platform: options.platform,
      maxTouchPoints: options.maxTouchPoints,
      standalone: options.standalone,
    },
  };
  const fire = (type: string, event: Event) => {
    for (const listener of listeners.get(type) ?? []) listener(event);
  };
  const registered = (type: string) => (listeners.get(type) ?? []).length;
  return { env, fire, registered };
}

/** The browser's install event with its `prompt` (Chromium's answer is `outcome`, or a refusal when `outcome` is `throws`). */
function installEvent(outcome: "accepted" | "dismissed" | "throws" = "dismissed") {
  const prompt = vi.fn(async () => {
    if (outcome === "throws") throw new Error("prompt refused");
    return { outcome };
  });
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt,
  }) as InstallPromptEvent;
  return { event, prompt };
}

/** A store on a fake browser, started as the app starts it. */
function startedStore(options: BrowserOptions = {}) {
  const browser = fakeBrowser(options);
  const store = createInstallPrompt(browser.env);
  store.start();
  return { ...browser, store };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("US-QS-28 the install event is kept for Konto", () => {
  it("US-QS-28 keeps the browser's install event and does not prevent it, so the browser shows its own install bar", () => {
    const { fire, store } = startedStore();
    const { event } = installEvent();
    fire("beforeinstallprompt", event);
    expect(event.defaultPrevented).toBe(false);
    expect(store.offer()).toBe("promptable");
  });

  it("US-QS-28 a browser that fires no install event offers nothing and writes nothing to the console", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { store } = startedStore({ userAgent: ANDROID_CHROME });
    expect(store.offer()).toBe("none");
    expect(warn).not.toHaveBeenCalled();
  });

  it("US-QS-28 a second start adds no second set of listeners", () => {
    const browser = fakeBrowser();
    const store = createInstallPrompt(browser.env);
    store.start();
    store.start();
    expect(browser.registered("beforeinstallprompt")).toBe(1);
    expect(browser.registered("appinstalled")).toBe(1);
  });

  it("US-QS-28 subscribers hear each change of the offer and stop hearing it once they unsubscribe", () => {
    const { fire, store } = startedStore();
    const heard = vi.fn();
    const stop = store.subscribe(heard);
    fire("beforeinstallprompt", installEvent().event);
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    fire("beforeinstallprompt", installEvent().event);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});

describe("US-QS-28 the entry asks the kept event for the install", () => {
  it("US-QS-28 choosing the entry calls prompt() on the kept event and the entry is gone while the prompt is open", async () => {
    const { fire, store } = startedStore();
    const { event, prompt } = installEvent("accepted");
    fire("beforeinstallprompt", event);
    const answer = store.prompt();
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(store.offer()).toBe("none");
    await expect(answer).resolves.toBe("accepted");
  });

  it("US-QS-28 an accepted prompt ends the entry and the app counts as installed", async () => {
    const { fire, store } = startedStore();
    fire("beforeinstallprompt", installEvent("accepted").event);
    await store.prompt();
    expect(store.offer()).toBe("none");
  });

  it("US-QS-28 the browser's installed event ends the entry", () => {
    const { fire, store } = startedStore();
    fire("beforeinstallprompt", installEvent().event);
    expect(store.offer()).toBe("promptable");
    fire("appinstalled", new Event("appinstalled"));
    expect(store.offer()).toBe("none");
  });

  it("US-QS-28 a dismissed prompt hides the entry until the browser fires a new event; a used event is never prompted twice", async () => {
    const { fire, store } = startedStore();
    const first = installEvent("dismissed");
    fire("beforeinstallprompt", first.event);
    await expect(store.prompt()).resolves.toBe("dismissed");
    expect(store.offer()).toBe("none");

    await expect(store.prompt()).resolves.toBe("failed");
    expect(first.prompt).toHaveBeenCalledTimes(1);

    fire("beforeinstallprompt", installEvent().event);
    expect(store.offer()).toBe("promptable");
  });

  it("US-QS-28 a refused prompt is written to the console and reported as failed, not thrown (P-10)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { fire, store } = startedStore();
    fire("beforeinstallprompt", installEvent("throws").event);
    await expect(store.prompt()).resolves.toBe("failed");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(store.offer()).toBe("none");
  });

  it("US-QS-28 a prompt without a kept event reports failed and calls nothing", async () => {
    const { store } = startedStore();
    await expect(store.prompt()).resolves.toBe("failed");
  });
});

describe("US-QS-28 the states of the offer", () => {
  it("US-QS-28 an installed app shows neither the entry nor the guide, even with a kept event", () => {
    const standalone = startedStore({ displayStandalone: true });
    standalone.fire("beforeinstallprompt", installEvent().event);
    expect(standalone.store.offer()).toBe("none");

    const iosHome = startedStore({ userAgent: IPHONE_SAFARI, standalone: true });
    expect(iosHome.store.offer()).toBe("none");
  });

  it("US-QS-28 Safari on an iPhone gets the guide, because it has no install prompt", () => {
    const { store } = startedStore({ userAgent: IPHONE_SAFARI });
    expect(store.offer()).toBe("ios-guide");
  });

  it("US-QS-28 Safari on an iPad gets the guide, and iPadOS, which reports itself as a Mac with touch points, counts too", () => {
    expect(startedStore({ userAgent: IPAD_SAFARI }).store.offer()).toBe("ios-guide");
    expect(
      startedStore({
        userAgent: MAC_SAFARI,
        platform: "MacIntel",
        maxTouchPoints: 5,
      }).store.offer(),
    ).toBe("ios-guide");
  });

  it("US-QS-28 a Mac without touch points gets no guide", () => {
    const { store } = startedStore({
      userAgent: MAC_SAFARI,
      platform: "MacIntel",
      maxTouchPoints: 0,
    });
    expect(store.offer()).toBe("none");
  });

  it("US-QS-28 other browsers on iOS get no guide, because their steps differ from Safari's", () => {
    expect(startedStore({ userAgent: IPHONE_CHROME }).store.offer()).toBe("none");
    expect(startedStore({ userAgent: IPHONE_FIREFOX }).store.offer()).toBe("none");
  });

  it("US-QS-28 a browser that offers no installation and is not Safari on iOS shows no entry and no error", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { store } = startedStore({ userAgent: ANDROID_CHROME });
    expect(store.offer()).toBe("none");
    expect(warn).not.toHaveBeenCalled();
  });
});
