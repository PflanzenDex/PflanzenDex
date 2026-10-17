import type { Distribution } from "@pflanzendex/core";

/** Answer of `GET /specimens/distribution` for an account without zones (tests only, no product code). */
export const EMPTY_DISTRIBUTION: { distribution: Distribution } = {
  distribution: {
    zones: [],
    thinnest: [],
    notCounted: { cuttingLight: 0, archived: 0, zoneUnknown: 0 },
    hint: {
      text: "Es gibt keine Lichtzone für erwachsene Pflanzen.",
      nextAction: "Lege unter „Licht“ mindestens zwei Lichtzonen an.",
    },
  },
};
