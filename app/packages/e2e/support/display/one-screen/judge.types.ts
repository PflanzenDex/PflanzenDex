// The data of the one-screen gate (US-QS-15, QG-U8, issue 2417): what the browser measures and what the judgement returns. Types
// only: no threshold or rule here (those are in judge.ts).

type SizeKind = "fit" | "cap" | "text200";
export interface Size {
  name: string;
  width: number;
  height: number;
  kind: SizeKind;
}

/** What a failure is about. */
export type Rule = "frame" | "sideways" | "marker" | "pager" | "title" | "action" | "cap";

/** A vertical scroll region, marked `data-scroll-region` or not. */
export type Scroller = { el: string; marked: boolean; scroll: number; client: number };
/** A sideways scroll region; `marker` is its `data-scroll-x` value, null without one. */
export type Sideways = { el: string; marker: string | null; scroll: number; client: number };
/** A `data-scroll-x` attribute; `value` is "" when it has no value. */
type Marker = { el: string; value: string };
/** A box in the window; `limit` is where the first screen ends there (the window height or a bar over the bottom edge). */
export type Spot = { top: number; bottom: number; limit: number; el: string; bar: string };
export type Layer = { reach: number; el: string };
/** The first screen: title and action at load, the same after the largest region scrolled to its end (null when none does). */
export type First = {
  title: Spot | null;
  action: Spot | null;
  scrolled: { el: string; title: Spot | null; action: Spot | null } | null;
  layer: Layer | null;
};

/** What the page reports about itself at one size (fit.ts, fit.boxes.ts). */
export interface Raw {
  scrollHeight: number;
  innerHeight: number;
  scrollWidth: number;
  innerWidth: number;
  rem: number; // root font size in px; 200 % text doubles it
  scrollers: Scroller[];
  sideways: Sideways[];
  markers: Marker[];
  pagers: string[]; // visible Pagers (`data-pager`), named by their list
  pageEl: string;
  hEl: string;
  first?: First | null;
  paint: {
    left: number;
    right: number;
    clientWidth: number;
    leftEl: string;
    rightEl: string;
  } | null;
}

export interface Result {
  screen: string;
  size: string;
  page: number;
  inner: number;
  pageX: number;
  innerX: number;
  cap: number;
  failures: string[];
  rules: Rule[];
}

export interface BaselineEntry {
  screen: string;
  size: string;
  page: number;
  inner: number;
  pageX?: number;
  innerX?: number;
  cap?: number;
  rules?: Rule[]; // the rules that fail at this size (FR-QG-17)
}

export interface Baseline {
  maxEntries: number;
  entries: BaselineEntry[];
}
