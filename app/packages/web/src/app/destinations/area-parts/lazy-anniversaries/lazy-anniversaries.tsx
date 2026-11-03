import { lazy, Suspense } from "react";

const List = lazy(() => import("@/achievements").then((m) => ({ default: m.Anniversaries })));

/** The anniversaries of the Today list (US-ACH-06) load on their own after the first paint (DS-08). */
export function LazyAnniversaries(props: {
  api: string;
  token: () => Promise<string | undefined>;
  onOpen: () => void;
}) {
  return (
    <Suspense fallback={null}>
      <List {...props} />
    </Suspense>
  );
}
