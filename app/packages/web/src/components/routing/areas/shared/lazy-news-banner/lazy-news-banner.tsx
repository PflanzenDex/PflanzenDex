import { lazy, Suspense } from "react";

const Banner = lazy(() =>
  import("@/achievements").then((m) => ({ default: m.AchievementNewsBanner })),
);

/** The module of the achievements loads on its own after the first paint, so the banner adds nothing to the initial bundle (DS-08). */
export function AchievementNewsBanner(props: {
  api: string;
  token: () => Promise<string | undefined>;
}) {
  return (
    <Suspense fallback={null}>
      <Banner {...props} />
    </Suspense>
  );
}
