import { lazy, Suspense } from "react";

const Banner = lazy(() =>
  import("./news-banner").then((m) => ({ default: m.AchievementNewsBanner })),
);

/** The banner loads on its own after the first paint, so it adds nothing to the initial bundle (DS-08). */
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
