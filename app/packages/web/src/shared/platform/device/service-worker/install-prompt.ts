// US-QS-28 · Konto offers to install the app (issue 1690). Chromium fires `beforeinstallprompt` once the app can be installed,
// possibly before Konto mounts, so the app keeps the event from its start (`startInstallPrompt`, called in app/main.tsx).
// The event is not prevented: the browser keeps its own install bar (owner decision 2026-11-09). Konto asks the kept event
// for the install when the keeper chooses "App installieren". Safari on an iPhone or iPad has no install prompt, so Konto
// shows a text guide there instead. An installed app shows neither.
import { useSyncExternalStore } from "react";

/** What Konto offers: the browser's install prompt, the guide for Safari on iPhone and iPad, or nothing. */
export type InstallOffer = "promptable" | "ios-guide" | "none";

/** The result of asking the browser; `failed` covers a browser that refused and a prompt without a kept event. */
export type InstallChoice = "accepted" | "dismissed" | "failed";

/** The browser's install event (Chromium's `BeforeInstallPromptEvent`): it can be prompted once, from a user gesture. */
export type InstallPromptEvent = Event & {
  prompt(): Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** The part of the browser that the store reads: the window's events and display mode, and the navigator. */
export type InstallEnvironment = {
  addEventListener(type: string, listener: (event: Event) => void): void;
  matchMedia?: (query: string) => { readonly matches: boolean };
  navigator: {
    readonly userAgent: string;
    readonly platform?: string | undefined;
    readonly maxTouchPoints?: number | undefined;
    readonly standalone?: boolean | undefined;
  };
};

/** Other browsers on iOS: they have their own steps, so the guide is for Safari only. */
const IOS_OTHER_BROWSER = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|GSA\//;

/** Safari on an iPhone or iPad. iPadOS reports itself as a Mac with touch points, so both checks count. */
function isIosSafari(nav: InstallEnvironment["navigator"]): boolean {
  const ua = nav.userAgent;
  const iPhone = /iPhone|iPod/.test(ua);
  const iPad = /iPad/.test(ua) || (nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1);
  return (iPhone || iPad) && /Safari\//.test(ua) && !IOS_OTHER_BROWSER.test(ua);
}

/** The app runs installed: in its own window (display mode standalone), or iOS started it from the home screen. */
function runsInstalled(env: InstallEnvironment): boolean {
  return (
    env.matchMedia?.("(display-mode: standalone)").matches === true ||
    env.navigator.standalone === true
  );
}

export type InstallPrompt = {
  /** Listens for the browser's install events; a second call changes nothing. */
  start(): void;
  /** The offer at this moment (the snapshot that `useInstallOffer` reads). */
  offer(): InstallOffer;
  /** Calls the listener whenever the offer may have changed; returns the function that ends the subscription. */
  subscribe(listener: () => void): () => void;
  /**
   * Asks the browser to install the app with the kept event. The event is used once and leaves the store before the
   * browser answers, so the entry is gone while the prompt is open; a dismissal keeps it hidden until a new event comes.
   */
  prompt(): Promise<InstallChoice>;
};

/** The store over one browser. The app uses `installPrompt()`; the tests inject a fake browser here. */
export function createInstallPrompt(env: InstallEnvironment): InstallPrompt {
  let kept: InstallPromptEvent | undefined;
  let installed = false;
  let started = false;
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of listeners) listener();
  };

  function offer(): InstallOffer {
    if (installed || runsInstalled(env)) return "none";
    if (kept) return "promptable";
    return isIosSafari(env.navigator) ? "ios-guide" : "none";
  }

  function start(): void {
    if (started) return;
    started = true;
    // Not prevented: the browser keeps its own install bar, and Konto asks for the install with this event later.
    env.addEventListener("beforeinstallprompt", (event) => {
      kept = event as InstallPromptEvent;
      changed();
    });
    env.addEventListener("appinstalled", () => {
      installed = true;
      kept = undefined;
      changed();
    });
  }

  async function prompt(): Promise<InstallChoice> {
    const event = kept;
    if (!event) return "failed";
    kept = undefined;
    changed();
    try {
      const { outcome } = await event.prompt();
      if (outcome === "accepted") installed = true;
      changed();
      return outcome === "accepted" ? "accepted" : "dismissed";
    } catch (cause) {
      console.warn("PflanzenDéx: the browser did not open the install prompt.", cause);
      changed();
      return "failed";
    }
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return { start, offer, subscribe, prompt };
}

/** The browser behind the app's store: the window's events and display mode, and the navigator. */
function browserEnvironment(): InstallEnvironment {
  return {
    addEventListener: (type, listener) => window.addEventListener(type, listener),
    matchMedia: (query) => window.matchMedia(query),
    navigator,
  };
}

let shared: InstallPrompt | undefined;

/** The app's one store, made from the browser on first use. */
export function installPrompt(): InstallPrompt {
  shared ??= createInstallPrompt(browserEnvironment());
  return shared;
}

/** Keeps the browser's install event from the start of the app; `app/main.tsx` calls it before the first render. */
export function startInstallPrompt(): void {
  installPrompt().start();
}

/** The offer of Konto, re-rendered when the browser's install events change it (`none` before the store starts). */
export function useInstallOffer(): InstallOffer {
  const store = installPrompt();
  return useSyncExternalStore(store.subscribe, store.offer, () => "none");
}

/** Asks the browser to install the app with the kept event (US-QS-28). */
export function promptInstall(): Promise<InstallChoice> {
  return installPrompt().prompt();
}
