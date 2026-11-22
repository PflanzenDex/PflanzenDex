import { lazy, Suspense, useSyncExternalStore } from "react";

const Banner = lazy(() =>
  import("@/achievements").then((m) => ({ default: m.AchievementNewsBanner })),
);

// The line under the title of "Heute" that takes the achievement notice (F-0070). The notice lives in the shell and the line
// on one page, which do not know each other, so the line registers its element here and the notice draws into it.
let slot: HTMLElement | null = null;
const listeners = new Set<() => void>();
const register = (element: HTMLElement | null) => {
  slot = element;
  listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/**
 * The place of the achievement notice under the title of "Heute": empty it hides itself (`empty:hidden`) and is the `peer`
 * that hides the summary while it holds the notice (`TitleLine`, F-0070, SG-FEED-05).
 */
export function NoticeSlot() {
  return <div ref={register} className="peer empty:hidden" />;
}

/**
 * The module of the achievements loads on its own after the first paint, so the notice adds nothing to the initial bundle
 * (DS-08). It is drawn into the slot of "Heute" when that page is open and announced on every page.
 */
export function AchievementNewsBanner(props: {
  api: string;
  token: () => Promise<string | undefined>;
}) {
  const place = useSyncExternalStore(subscribe, () => slot);
  return (
    <Suspense fallback={null}>
      <Banner {...props} slot={place} />
    </Suspense>
  );
}
