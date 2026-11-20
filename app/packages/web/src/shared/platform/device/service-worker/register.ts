// US-QS-27 · The app's worker is registered at the start of production builds (issue 1688). A browser without workers, a page
// outside a secure context and a failed registration all leave the app as it is. The failure is written to the console and
// nothing is shown to the keeper (P-10).

/** The worker script, at the root so that its scope is the whole app. */
export const APP_WORKER_URL = "/sw.js";

const workersOf = (): ServiceWorkerContainer | undefined =>
  typeof navigator === "undefined" ? undefined : navigator.serviceWorker;

/**
 * Registers the worker when the browser has one (`navigator.serviceWorker`). Resolves to the registration, or to `undefined`
 * when there is no container or the registration failed. It never rejects and never throws.
 */
export function registerAppWorker(
  container: ServiceWorkerContainer | undefined = workersOf(),
): Promise<ServiceWorkerRegistration | undefined> {
  if (!container) return Promise.resolve(undefined);
  return Promise.resolve()
    .then(() => container.register(APP_WORKER_URL))
    .catch((cause: unknown) => {
      console.warn(
        "PflanzenDéx: the service worker did not register; the app runs without it.",
        cause,
      );
      return undefined;
    });
}

/** The part of the window that the scheduling uses: its load state, its load event and, where it exists, the idle callback. */
export type PageWindow = {
  readonly document: { readonly readyState: DocumentReadyState };
  addEventListener(type: "load", listener: () => void, options?: { once: boolean }): void;
  requestIdleCallback?: (callback: () => void) => unknown;
};

/**
 * Registers the worker once the page has loaded and the browser is idle (US-QS-27, issue 1688), so the install never
 * competes with the first load: the app works at once. Without `requestIdleCallback` (Safari) it waits one timer tick after
 * the load instead.
 */
export function scheduleAppWorker(
  page: PageWindow = window,
  register: () => unknown = () => registerAppWorker(),
): void {
  const start = () => {
    if (typeof page.requestIdleCallback === "function") page.requestIdleCallback(register);
    else setTimeout(register, 0);
  };
  if (page.document.readyState === "complete") start();
  else page.addEventListener("load", start, { once: true });
}
