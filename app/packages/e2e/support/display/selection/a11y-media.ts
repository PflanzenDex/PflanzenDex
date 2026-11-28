// The media of the accessibility warning run (US-QG-02, issue 2666): A11Y_ROUTES_MEDIA of make a11y-routes runs the keyboard walk and
// axe under forced colors or with reduced motion. Such a run records its findings and compares them with no baseline (the
// warning tier counts them; see nightly.yml). Pure: the self-test is in a11y-routes-self-test.spec.ts.

export type A11yMedia = "" | "forced-colors" | "reduced-motion";

export const A11Y_MEDIA: readonly A11yMedia[] = ["", "forced-colors", "reduced-motion"];

/** The media that a value names: unset or empty is the normal run; any other unknown value throws. */
export function a11yMediaOf(value: string | undefined): A11yMedia {
  const text = value ?? "";
  if ((A11Y_MEDIA as readonly string[]).includes(text)) return text as A11yMedia;
  throw new Error(
    `a11y-routes: A11Y_ROUTES_MEDIA "${text}" is not one of forced-colors, reduced-motion (or unset)`,
  );
}

/** The browser context options of a media value: forced colors, or reduced motion, or none. */
export function mediaOptions(media: A11yMedia): {
  forcedColors?: "active";
  reducedMotion?: "reduce";
} {
  if (media === "forced-colors") return { forcedColors: "active" };
  if (media === "reduced-motion") return { reducedMotion: "reduce" };
  return {};
}

/** Whether a run is judged against the baseline: the normal run is, a media run is not, and a write never is (US-QG-02). */
export function comparesWithBaseline(media: A11yMedia, write: boolean): boolean {
  return !write && media === "";
}
