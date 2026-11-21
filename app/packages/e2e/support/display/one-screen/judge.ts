// The pure part of the one-screen gate (US-QS-15, DS-58, issue 1137, QG-U8): what a measurement means. The comparison
// with the baseline is in baseline.ts. No browser here, so the self-test in tests/accessibility/routes/one-screen.spec.ts runs
// without one. Below 768 px a list and the Heute frame may scroll vertically; the first screen is judged instead (owner
// decision 2026-11-20, issue 1854).

export type SizeKind = "fit" | "cap" | "text200";

export interface Size {
  name: string;
  width: number;
  height: number;
  kind: SizeKind;
}

/** Owner decision 2026-11-02 (issue 1160): phones, tablets, FullHD; 2560 checks the 1920 px width cap; 200 % text on a phone. */
export const SIZES: readonly Size[] = [
  { name: "360x640", width: 360, height: 640, kind: "fit" },
  { name: "390x844", width: 390, height: 844, kind: "fit" },
  { name: "768x1024", width: 768, height: 1024, kind: "fit" },
  { name: "1024x768", width: 1024, height: 768, kind: "fit" },
  { name: "1920x1080", width: 1920, height: 1080, kind: "fit" },
  { name: "2560x1440", width: 2560, height: 1440, kind: "cap" },
  { name: "360x640@200%", width: 360, height: 640, kind: "text200" },
];

/** A phone: below this width the first screen is judged, not the vertical scroll. */
const PHONE_BELOW = 768;
export const isPhone = (size: Size): boolean => size.width < PHONE_BELOW;
/** The first rows that must stand fully in the first screen: two, one at 200 % text. */
const wantedRows = (size: Size): number => (size.kind === "text200" ? 1 : 2);

/** One pixel of tolerance for subpixel rounding (owner decision: at most 1.00 with 1 px, not 1.02). */
const TOLERANCE_PX = 1;
/** The painted area is at most this wide at 2560 px (1920 px plus one pixel of rounding) and centered within 2 px. */
const CAP_WIDTH = 1921;
const CENTER_PX = 2;

export interface Region {
  scrollHeight: number;
  clientHeight: number;
  el: string;
}

export interface RegionX {
  scrollWidth: number;
  clientWidth: number;
  el: string;
}

/** A box in the window; `limit` is where the first screen ends there: the window height, a fixed or sticky bar over the bottom edge that does not contain it, or the region that clips it (`bar` names that one). */
export type Spot = { top: number; bottom: number; limit: number; el: string; bar: string };
/** The first screen of a phone (fit.first.ts): the title, the first rows (at most two) of the largest list and the first primary action; rows are empty without a list, the action null without one. */
export type First = { title: Spot | null; rows: Spot[]; action: Spot | null };

/** What the page reports about itself at one size (measured in the browser, see fit.ts). */
export interface Raw {
  scrollHeight: number;
  innerHeight: number;
  scrollWidth: number;
  innerWidth: number;
  region: Region | null;
  regionX: RegionX | null;
  /** The largest sideways region outside rows marked `data-scroll-x="row"` (judged at 200 % text). */
  regionXUnmarked?: RegionX | null;
  pageEl: string;
  hEl: string;
  /** Measured at phone sizes only; a phone without it fails (P-10). */
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
}

export interface BaselineEntry {
  screen: string;
  size: string;
  page: number;
  inner: number;
  pageX?: number;
  innerX?: number;
  cap?: number;
}

export interface Baseline {
  maxEntries: number;
  entries: BaselineEntry[];
}

const round = (n: number) => Math.round(n * 100) / 100;

function capOver(raw: Raw): { over: number; text: string } {
  const p = raw.paint;
  if (!p) return { over: 0, text: "" };
  const width = p.right - p.left;
  const off = Math.abs(p.left - (p.clientWidth - p.right)) - CENTER_PX;
  const over = Math.max(0, Math.round(Math.max(width - CAP_WIDTH, off)));
  const text = `paints ${Math.round(p.left)}..${Math.round(p.right)} of ${p.clientWidth} (width ${Math.round(width)}, cap ${CAP_WIDTH}, centered within ${CENTER_PX}): ${p.rightEl} / ${p.leftEl}`;
  return { over, text };
}

const fmt = (n: number) => n.toFixed(2);

// Sideways (owner decision on issue 1183): the page never scrolls sideways. At the normal sizes no inner region does
// either; at 200 % text a row marked `data-scroll-x="row"` (segmented control, tab strip, chip row) may scroll inside its
// own box (DS-63), every other region may not. `exemptX` (register: sidewaysExempt) skips only the inner region.
function sideways(
  raw: Raw,
  exemptX: boolean,
  largeText: boolean,
): { pageX: number; innerX: number; failures: string[] } {
  const failures: string[] = [];
  const pageX = raw.scrollWidth / raw.innerWidth;
  const rx = exemptX ? null : largeText ? (raw.regionXUnmarked ?? null) : raw.regionX;
  const innerX = rx ? rx.scrollWidth / rx.clientWidth : 1;
  if (raw.scrollWidth > raw.innerWidth + TOLERANCE_PX)
    failures.push(
      `page sideways ${fmt(pageX)} (${raw.scrollWidth} px of ${raw.innerWidth} px), rightmost: ${raw.hEl}`,
    );
  if (rx && rx.scrollWidth > rx.clientWidth + TOLERANCE_PX)
    failures.push(
      `inner sideways ${fmt(innerX)} (${rx.scrollWidth} px of ${rx.clientWidth} px) ↔ ${rx.el}`,
    );
  return { pageX, innerX, failures };
}

const cut = (s: Spot) => s.top < -TOLERANCE_PX || s.bottom > s.limit + TOLERANCE_PX;
const where = (s: Spot) =>
  `${s.el} spans ${Math.round(s.top)}..${Math.round(s.bottom)} px, the first screen ends at ${Math.round(s.limit)} px${s.bar ? ` under ${s.bar}` : ""}`;

// The first screen of a phone: the title, the first rows of the list and the primary action stand fully in the window at
// load and not under a fixed bar. A view without a list or without a primary action skips that part; no title fails.
function firstScreen(first: First | null | undefined, size: Size): string[] {
  if (!first) return ["first screen not measured"];
  const failures: string[] = [];
  if (!first.title) failures.push("first screen: no page title (heading of the layer, or h1)");
  else if (cut(first.title)) failures.push(`first screen: title is cut: ${where(first.title)}`);
  const need = Math.min(wantedRows(size), first.rows.length);
  const row = first.rows.slice(0, need).find(cut);
  if (row) failures.push(`first screen: fewer than ${need} first rows are whole: ${where(row)}`);
  if (first.action && cut(first.action))
    failures.push(`first screen: primary action is cut: ${where(first.action)}`);
  return failures;
}

// From 768 px the page and every scroll region stand in the window (1 px tolerance); at 200 % text a region may scroll.
function vertical(raw: Raw, size: Size): string[] {
  const failures: string[] = [];
  if (raw.scrollHeight > raw.innerHeight + TOLERANCE_PX)
    failures.push(
      `page ${(raw.scrollHeight / raw.innerHeight).toFixed(2)} (${raw.scrollHeight} px of ${raw.innerHeight} px), lowest: ${raw.pageEl}`,
    );
  const r = raw.region;
  if (r && r.scrollHeight > r.clientHeight + TOLERANCE_PX && size.kind === "fit")
    failures.push(
      `inner ${(r.scrollHeight / r.clientHeight).toFixed(2)} (${r.scrollHeight} px of ${r.clientHeight} px): ${r.el}`,
    );
  return failures;
}

/** Turns one measurement into a result with named failures. Pure. */
export function evaluate(screen: string, size: Size, raw: Raw, sidewaysExempt = false): Result {
  const failures: string[] = [];
  if (size.kind === "cap") {
    const { over, text } = capOver(raw);
    if (over > 0) failures.push(`width cap exceeded by ${over} px: ${text}`);
    return { screen, size: size.name, page: 0, inner: 0, pageX: 0, innerX: 0, cap: over, failures };
  }
  const page = raw.scrollHeight / raw.innerHeight;
  const inner = raw.region ? raw.region.scrollHeight / raw.region.clientHeight : 1;
  // On a phone the ratios are reported, not judged: a list may scroll, the first screen is (issue 1854).
  if (!isPhone(size)) failures.push(...vertical(raw, size));
  const x = sideways(raw, sidewaysExempt, size.kind === "text200");
  failures.push(...x.failures);
  if (isPhone(size)) failures.push(...firstScreen(raw.first, size));
  return {
    screen,
    size: size.name,
    page: round(page),
    inner: round(inner),
    pageX: round(x.pageX),
    innerX: round(x.innerX),
    cap: 0,
    failures,
  };
}
