// Class-group table for `cn` (DS-31): the part of the tailwind-merge default config this app can use, copied
// verbatim. The default config alone is about 9 kB gzip of the initial JavaScript (QG-U6); this subset needs less
// than half of that. A Tailwind class outside the table is not merged (kept as written) until its group is copied
// here from the tailwind-merge default config; class-merge.test.ts fails for every class in `src` that the
// default config would merge but this table does not.
import type { Config } from "tailwind-merge";
import { GROUPS_1 } from "./groups/groups-1";
import { GROUPS_2 } from "./groups/groups-2";
import { GROUPS_3 } from "./groups/groups-3";
import { isAny, isAnyNonArbitrary, isNumber, isTshirtSize } from "./merge-scales";

export const MERGE_CONFIG: Config<string, string> = {
  cacheSize: 500,
  theme: {
    animate: ["spin", "ping", "pulse", "bounce"],
    aspect: ["video"],
    breakpoint: [isTshirtSize],
    color: [isAny],
    container: [isTshirtSize],
    ease: ["in", "out", "in-out"],
    font: [isAnyNonArbitrary],
    "font-weight": [
      "thin",
      "extralight",
      "light",
      "normal",
      "medium",
      "semibold",
      "bold",
      "extrabold",
      "black",
    ],
    leading: ["none", "tight", "snug", "normal", "relaxed", "loose"],
    radius: [isTshirtSize],
    shadow: [isTshirtSize],
    spacing: ["px", isNumber],
    text: [isTshirtSize],
    tracking: ["tighter", "tight", "normal", "wide", "wider", "widest"],
  },
  classGroups: { ...GROUPS_1, ...GROUPS_2, ...GROUPS_3 },
  conflictingClassGroups: {
    overscroll: ["overscroll-x", "overscroll-y"],
    flex: ["basis", "grow", "shrink"],
    overflow: ["overflow-x", "overflow-y"],
    inset: ["inset-x", "top", "right", "bottom", "left"],
    "inset-x": ["right", "left"],
    gap: ["gap-x", "gap-y"],
    p: ["px", "py", "pt", "pb", "pl"],
    px: ["pl"],
    py: ["pt", "pb"],
    m: ["mx", "my", "mt", "mr", "mb", "ml"],
    mx: ["mr", "ml"],
    my: ["mt", "mb"],
    size: ["w", "h"],
    "font-size": ["leading"],
    "border-w": ["border-w-t", "border-w-r", "border-w-b", "border-w-l"],
    "border-color": ["border-color-t", "border-color-r", "border-color-b", "border-color-l"],
  },
  conflictingClassGroupModifiers: { "font-size": ["leading"] },
  orderSensitiveModifiers: [
    "*",
    "**",
    "after",
    "backdrop",
    "before",
    "details-content",
    "file",
    "first-letter",
    "first-line",
    "marker",
    "placeholder",
    "selection",
  ],
};
