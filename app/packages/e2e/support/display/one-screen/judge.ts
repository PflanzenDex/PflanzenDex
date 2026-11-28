// The pure part of the one-screen gate (US-QS-15, DS-58, DS-60, DS-61, DS-63, issue 1137, QG-U8): what a measurement means.
// The baseline comparison is in baseline.ts; the data types are in judge.types.ts. No browser here, so the self-tests run
// without one. A display tolerance: loosening it turns a red run green (US-QG-07).
import { sizeFound } from "./judge.size";
import type { First, Found, Raw, Result, Rule, Scroller, Size, Spot } from "./judge.types";
export type {
  Baseline,
  BaselineEntry,
  First,
  Layer,
  Raw,
  Result,
  Scroller,
  Sideways,
  Size,
  Spot,
} from "./judge.types";

/**
 * Owner decision 2026-11-02 (issue 1160): phones, tablets, FullHD; 2560 checks the width cap; 200 % text on a phone.
 * US-QG-02 (owner decision d-190, issue 2666): the 200 % text size is measured by the warning run nightly-a11y-report, not on pull
 * requests and not by the blocking nightly-a11y (ONE_SCREEN_SIZES, selection/size-set.ts).
 */
export const SIZES: readonly Size[] = [
  { name: "360x640", width: 360, height: 640, kind: "fit" },
  { name: "390x844", width: 390, height: 844, kind: "fit" },
  { name: "768x1024", width: 768, height: 1024, kind: "fit" },
  { name: "1024x768", width: 1024, height: 768, kind: "fit" },
  { name: "1920x1080", width: 1920, height: 1080, kind: "fit" },
  { name: "2560x1440", width: 2560, height: 1440, kind: "cap" },
  { name: "360x640@200%", width: 360, height: 640, kind: "text200" },
];

const TOLERANCE_PX = 1; // owner decision: at most 1.00 with 1 px, not 1.02
const CAP_WIDTH = 1921; // 1920 px plus one pixel of rounding, centered within CENTER_PX
const CENTER_PX = 2;
const FIXED_FRAME_REM = 30; // DS-25: a window lower than this may scroll its frame
const SIDEWAYS_KINDS: readonly string[] = ["table", "cards", "chips", "tabs"]; // DS-63, issue 2417: every size
const ROW_KIND = "row"; // a segmented control: at 200 % text only (issue 1183)
const KINDS: readonly string[] = [...SIDEWAYS_KINDS, ROW_KIND];
/** Rules that hold or fail as a whole: a listed one that no longer fails must leave the baseline. */
export const BINARY_RULES: readonly Rule[] = ["pager", "marker", "title", "action", "size"];

const round = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toFixed(2);

function capOver(raw: Raw): { over: number; text: string } {
  const p = raw.paint;
  if (!p) return { over: 0, text: "" };
  const width = p.right - p.left;
  const off = Math.abs(p.left - (p.clientWidth - p.right)) - CENTER_PX;
  const over = Math.max(0, Math.round(Math.max(width - CAP_WIDTH, off)));
  const text = `paints ${Math.round(p.left)}..${Math.round(p.right)} of ${p.clientWidth} (width ${Math.round(width)}, cap ${CAP_WIDTH}, centered within ${CENTER_PX}): ${p.rightEl} / ${p.leftEl}`;
  return { over, text };
}

/** The frame is fixed unless the text is 200 % (WCAG 1.4.10, DS-61) or the window is lower than 30 rem (DS-25). */
const isFixedFrame = (size: Size, raw: Raw): boolean =>
  size.kind !== "text200" && raw.innerHeight >= FIXED_FRAME_REM * raw.rem;

// The page never scrolls, and only a marked `data-scroll-region` scrolls (US-QS-15, DS-58). An open layer is judged by its box.
function frameFound(raw: Raw): Found[] {
  const found: Found[] = [];
  const layer = raw.first?.layer;
  const high = layer ? layer.reach : raw.scrollHeight;
  if (high > raw.innerHeight + TOLERANCE_PX)
    found.push([
      "frame",
      `frame: ${layer ? "layer" : "page"} ${fmt(high / raw.innerHeight)} (${high} px of ${raw.innerHeight} px), lowest: ${layer ? layer.el : raw.pageEl}`,
    ]);
  for (const s of raw.scrollers)
    if (!s.marked && s.scroll > s.client + TOLERANCE_PX)
      found.push([
        "frame",
        `frame: ${s.el} scrolls ${fmt(s.scroll / s.client)} (${s.scroll} px of ${s.client} px) without data-scroll-region`,
      ]);
  return found;
}

// The page never scrolls sideways beyond 1 px; a region may only when it is marked `data-scroll-x` (issues 1183, 2412, 2417).
// `exempt` (register: sidewaysExempt) skips the regions, never the page nor a marker value.
type SidewaysOut = { pageX: number; innerX: number; found: Found[] };
function sidewaysOf(raw: Raw, size: Size, exempt: boolean): SidewaysOut {
  const found: Found[] = [];
  const pageX = raw.scrollWidth / raw.innerWidth;
  if (raw.scrollWidth > raw.innerWidth + TOLERANCE_PX)
    found.push([
      "sideways",
      `sideways: page ${fmt(pageX)} (${raw.scrollWidth} px of ${raw.innerWidth} px), rightmost: ${raw.hEl}`,
    ]);
  const violating: number[] = [];
  for (const s of raw.sideways) {
    if (s.marker !== null && !KINDS.includes(s.marker)) continue; // named by markerFound
    if (
      s.marker !== null &&
      (SIDEWAYS_KINDS.includes(s.marker) || (s.marker === ROW_KIND && size.kind === "text200"))
    )
      continue;
    const r = s.scroll / s.client;
    violating.push(r);
    if (exempt) continue;
    found.push([
      "sideways",
      s.marker === null
        ? `sideways: ${s.el} scrolls sideways ${fmt(r)} (${s.scroll} px of ${s.client} px) without data-scroll-x`
        : `sideways: ${s.el} scrolls sideways ${fmt(r)} (${s.scroll} px of ${s.client} px) with data-scroll-x="row", which is for 200 % text only`,
    ]);
  }
  return { pageX, innerX: exempt ? 1 : Math.max(1, ...violating), found };
}

// A marker names its kind: a missing or unknown value fails by name, at every size (US-QS-15, DS-63).
function markerFound(raw: Raw): Found[] {
  const kinds = KINDS.join(", ");
  const text = (m: Raw["markers"][number]) =>
    m.value === ""
      ? `marker: ${m.el} has data-scroll-x without a value (${kinds})`
      : `marker: ${m.el} has data-scroll-x="${m.value}", which is no kind (${kinds})`;
  return raw.markers.filter((m) => !KINDS.includes(m.value)).map((m): Found => ["marker", text(m)]);
}

// No Pager at any size (US-QS-15, DS-60); until its removal (issue 2422) the uses are listed in the baseline.
function pagerFound(raw: Raw, size: Size): Found[] {
  const n = raw.pagers.length;
  if (n === 0) return [];
  const count = n === 1 ? "Pager" : `${n} Pagers`;
  const more = n > 1 ? ` and ${n - 1} more` : "";
  const text = `pager: ${count} at ${size.name} (no list is cut into pages, US-QS-15): ${raw.pagers[0] ?? ""}${more}`;
  return [["pager", text]];
}

const cut = (s: Spot) => s.top < -TOLERANCE_PX || s.bottom > s.limit + TOLERANCE_PX;
const where = (s: Spot) =>
  `${s.el} spans ${Math.round(s.top)}..${Math.round(s.bottom)} px, the first screen ends at ${Math.round(s.limit)} px${s.bar ? ` under ${s.bar}` : ""}`;

// The title and the primary action stay in the window at load and while the largest region scrolls (US-QS-15, DS-58). In a frame
// that may scroll (200 % text, a window under 30 rem) only the title is judged.
function firstFound(first: First | null | undefined, fixed: boolean): Found[] {
  if (!first) return [["measured", "first screen not measured"]]; // never baselined (issue 2427)
  const found: Found[] = [];
  const { title, action, scrolled } = first;
  if (!title) found.push(["title", "no page title (heading of the layer, or h1)"]);
  else if (cut(title)) found.push(["title", `title is cut: ${where(title)}`]);
  if (fixed && action && cut(action))
    found.push(["action", `primary action is cut: ${where(action)}`]);
  if (scrolled?.title && cut(scrolled.title))
    found.push([
      "title",
      `title moves out of the window while ${scrolled.el} scrolls: ${where(scrolled.title)}`,
    ]);
  if (fixed && scrolled?.action && cut(scrolled.action))
    found.push([
      "action",
      `action scrolls away while ${scrolled.el} scrolls: ${where(scrolled.action)}`,
    ]);
  return found;
}

/** Turns one measurement into a result with named failures. Pure. */
export function evaluate(screen: string, size: Size, raw: Raw, sidewaysExempt = false): Result {
  const base = { screen, size: size.name, page: 0, inner: 0, pageX: 0, innerX: 0 };
  if (size.kind === "cap") {
    const { over, text } = capOver(raw);
    return {
      ...base,
      cap: over,
      failures: over > 0 ? [`width cap exceeded by ${over} px: ${text}`] : [],
      rules: over > 0 ? ["cap"] : [],
    };
  }
  const fixed = isFixedFrame(size, raw);
  const sideways = sidewaysOf(raw, size, sidewaysExempt);
  const found: Found[] = [
    ...(fixed ? frameFound(raw) : []),
    ...sideways.found,
    ...markerFound(raw),
    ...pagerFound(raw, size),
    ...firstFound(raw.first, fixed),
    ...sizeFound(raw.sized, size),
  ];
  const unmarked = raw.scrollers.filter((s: Scroller) => !s.marked).map((s) => s.scroll / s.client);
  return {
    ...base,
    page: round(raw.scrollHeight / raw.innerHeight),
    inner: fixed ? round(Math.max(1, ...unmarked)) : 1, // a frame that may scroll has no inner limit (issue 2427)
    pageX: round(sideways.pageX),
    innerX: round(sideways.innerX),
    cap: 0,
    failures: found.map(([, text]) => text),
    rules: [...new Set(found.map(([r]) => r))],
  };
}
