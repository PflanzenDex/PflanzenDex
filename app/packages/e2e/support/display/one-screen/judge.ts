// The pure part of the one-screen gate (US-QS-15, DS-58, issue 1137, QG-U8): what a measurement means. The comparison
// with the baseline is in baseline.ts. No browser here, so the self-test in tests/accessibility/routes/one-screen.spec.ts runs
// without one.

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

/** What the page reports about itself at one size (measured in the browser, see fit.ts). */
export interface Raw {
  scrollHeight: number;
  innerHeight: number;
  scrollWidth: number;
  innerWidth: number;
  region: Region | null;
  pageEl: string;
  hEl: string;
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
  hOver: number;
  cap: number;
  failures: string[];
}

export interface BaselineEntry {
  screen: string;
  size: string;
  page: number;
  inner: number;
  hOver?: number;
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

/** Turns one measurement into a result with named failures. Pure. */
export function evaluate(screen: string, size: Size, raw: Raw): Result {
  const failures: string[] = [];
  if (size.kind === "cap") {
    const { over, text } = capOver(raw);
    if (over > 0) failures.push(`width cap exceeded by ${over} px: ${text}`);
    return { screen, size: size.name, page: 0, inner: 0, hOver: 0, cap: over, failures };
  }
  const page = raw.scrollHeight / raw.innerHeight;
  const inner = raw.region ? raw.region.scrollHeight / raw.region.clientHeight : 1;
  const hOver = Math.max(0, raw.scrollWidth - raw.innerWidth);
  if (raw.scrollHeight > raw.innerHeight + TOLERANCE_PX)
    failures.push(
      `page ${page.toFixed(2)} (${raw.scrollHeight} px of ${raw.innerHeight} px), lowest: ${raw.pageEl}`,
    );
  const innerBad = raw.region && raw.region.scrollHeight > raw.region.clientHeight + TOLERANCE_PX;
  // At 200 % text the content may scroll inside its own region; only the page must stand (WCAG 1.4.4, 1.4.10, DS-61).
  if (innerBad && raw.region && size.kind === "fit")
    failures.push(
      `inner ${inner.toFixed(2)} (${raw.region.scrollHeight} px of ${raw.region.clientHeight} px): ${raw.region.el}`,
    );
  if (hOver > 0) failures.push(`sideways overflow ${hOver} px: ${raw.hEl}`);
  return {
    screen,
    size: size.name,
    page: round(page),
    inner: round(inner),
    hOver,
    cap: 0,
    failures,
  };
}
