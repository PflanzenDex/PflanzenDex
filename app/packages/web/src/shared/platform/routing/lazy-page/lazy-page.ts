import { createElement, lazy, useState, type ComponentProps, type ComponentType } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any component; the props come from `C`
export type AnyComponent = ComponentType<any>;
type Loader<C extends AnyComponent> = () => Promise<{ default: C }>;

/**
 * A lazy page with its chunk in hand (US-QS-07): `load` requests the chunk once, for every caller, and `loaded` is the
 * component once it has arrived, else `null`. A window that must not show a Suspense fallback renders from these.
 */
export type LazyPage<C extends AnyComponent> = C & {
  load: () => Promise<C>;
  loaded: () => C | null;
};

/** Resets of the pages whose chunk failed to load: `React.lazy` remembers a failure for good, so a retry needs a new one. */
const failed = new Set<() => void>();

/** Gives every page whose chunk failed a fresh `React.lazy`, so the next render requests the chunk again (DS-08). */
export function retryFailedPages(): void {
  for (const reset of failed) reset();
  failed.clear();
}

/**
 * The lazy export of a route-level page (DS-08): the page's code is requested when its route opens, not with the
 * shell. Render it inside a `RouteBoundary`, which shows the skeleton meanwhile and an error with retry when the
 * chunk cannot be fetched (P-10).
 */
export function lazyPage<C extends AnyComponent>(load: Loader<C>): LazyPage<C> {
  let component: C | null = null;
  let request: Promise<C> | null = null;
  // One request at a time; a failure clears it, so the next call requests the chunk again (DS-08, P-10).
  const fetchChunk = (): Promise<C> => {
    request ??= load().then(
      (module) => {
        component = module.default;
        return module.default;
      },
      (cause: unknown) => {
        request = null;
        throw cause;
      },
    );
    return request;
  };
  const create = () => {
    const wrapped: Loader<C> = async () => {
      try {
        return { default: await fetchChunk() };
      } catch (cause) {
        failed.add(() => {
          current = create();
        });
        throw cause;
      }
    };
    return lazy(wrapped);
  };
  let current = create();
  // A page that mounts with its chunk in hand renders the component at once: React.lazy would suspend even for a
  // resolved chunk, and the Suspense fallback it commits starts React's hold of about 300 ms on the reveal (issue 1645).
  // The choice is made once per mounted page, so its element type never changes while it is shown.
  const Page = (props: ComponentProps<C>) => {
    const [ready] = useState<C | null>(() => component);
    return createElement(ready ?? current, props);
  };
  return Object.assign(Page as C, { load: fetchChunk, loaded: () => component });
}
