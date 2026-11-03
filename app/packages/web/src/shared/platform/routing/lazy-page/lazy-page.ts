import { createElement, lazy, type ComponentProps, type ComponentType } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any component; the props come from `C`
type AnyComponent = ComponentType<any>;
type Loader<C extends AnyComponent> = () => Promise<{ default: C }>;

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
export function lazyPage<C extends AnyComponent>(load: Loader<C>): C {
  const create = () => {
    const wrapped: Loader<C> = async () => {
      try {
        return await load();
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
  const Page = (props: ComponentProps<C>) => createElement(current, props);
  return Page as C;
}
