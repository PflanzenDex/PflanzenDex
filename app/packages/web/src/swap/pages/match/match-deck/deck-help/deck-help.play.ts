import { texts } from "@/shared/lib/text-rules/texts";
import { check, hasLayout, must, waitUntil } from "@/shared/testing/story-frame/story-play";
import { boxOf, settle, type Box } from "@/shared/testing/story-frame/table-measure";
import table from "../../../../swap.de.json";

const t = texts(table);

// What the play of the info button of the match deck judges (US-QS-15, SG-TOUCH-01, DS-37, issue 2611): what clips an element,
// how far its focus ring reaches, and how far two boxes stand apart. It reads the real layout; jsdom has none, so the play
// returns before its first measure there.

/** The room the focus ring keeps to its neighbours, in px: a smaller gap lets the ring touch the counter text or the card. */
const MIN_CLEAR = 4;
/** The size of a touch target (SG-TOUCH-01, DS-15). */
const TARGET = 44;
/** Sub-pixel rounding of a box is no clipping. */
const TOLERANCE = 0.5;

/** The window of an element that shows: the viewport cut by every ancestor that clips on an axis (`overflow` is not `visible`). */
function clipOf(element: Element): Box {
  const clip: Box = { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight };
  for (
    let at = element.parentElement;
    at && at !== document.documentElement;
    at = at.parentElement
  ) {
    const style = getComputedStyle(at);
    const box = boxOf(at);
    if (style.overflowY !== "visible") {
      clip.top = Math.max(clip.top, box.top);
      clip.bottom = Math.min(clip.bottom, box.bottom);
    }
    if (style.overflowX !== "visible") {
      clip.left = Math.max(clip.left, box.left);
      clip.right = Math.min(clip.right, box.right);
    }
  }
  return clip;
}

/** How far the focus ring of a focused element reaches past its box: the widest spread of its `box-shadow`, with offset and blur. */
function ringExtent(element: Element): number {
  // The colors come as `rgb(…, …, …)` with commas of their own: they go first, then the commas that separate the shadows.
  const shadows = getComputedStyle(element)
    .boxShadow.replace(/rgba?\([^)]*\)/g, "")
    .split(",");
  const reach = shadows.map((shadow) => {
    const lengths = shadow.split(" ").filter((word) => word.endsWith("px"));
    const [x = 0, y = 0, blur = 0, spread = 0] = lengths.map(parseFloat);
    return Math.max(Math.abs(x), Math.abs(y)) + blur + spread;
  });
  return Math.max(0, ...reach);
}

const grow = (box: Box, by: number): Box => ({
  top: box.top - by,
  left: box.left - by,
  right: box.right + by,
  bottom: box.bottom + by,
});

/** How many px of `box` lie outside `frame`: 0 when the box is whole inside it (within the rounding of a pixel). */
function cutOff(box: Box, frame: Box): number {
  const cut = Math.max(
    frame.top - box.top,
    box.bottom - frame.bottom,
    frame.left - box.left,
    box.right - frame.right,
  );
  return cut > TOLERANCE ? cut : 0;
}

/** The free distance between two boxes in px: 0 when they touch or overlap. */
function clearance(a: Box, b: Box): number {
  const across = Math.max(0, a.left - b.right, b.left - a.right);
  const along = Math.max(0, a.top - b.bottom, b.top - a.bottom);
  return Math.hypot(across, along);
}

/**
 * The info button of the deck, focused with the keyboard ring: the whole 44 px target and the whole ring stand inside the window
 * that shows (the frame of the page and every box that clips), and the ring keeps `MIN_CLEAR` px to the counter text and to the
 * card (the drag strip at its top edge).
 */
export async function judgeInfoButton(canvas: HTMLElement): Promise<void> {
  const button = must(
    canvas.querySelector<HTMLButtonElement>(`button[aria-label="${t("deck.helpButton")}"]`),
    "the info button of the deck",
  );
  if (!hasLayout(button)) return;
  const counter = must(button.parentElement?.querySelector("p"), "the counter text");
  const card = must(canvas.querySelector("[data-grip]"), "the drag strip of the card");
  await settle();
  button.focus();
  await waitUntil(() => button.matches(":focus-visible"), "the button shows its focus ring");
  const target = boxOf(button);
  const frame = clipOf(button);
  const ring = grow(target, ringExtent(button));
  const size = { width: target.right - target.left, height: target.bottom - target.top };
  check(
    size.width >= TARGET - TOLERANCE && size.height >= TARGET - TOLERANCE,
    `the target is ${TARGET} x ${TARGET} px (SG-TOUCH-01): it is ${size.width} x ${size.height}`,
  );
  check(
    cutOff(target, frame) === 0,
    `the whole target is inside the frame: ${cutOff(target, frame)} px are cut off (target top ${target.top}, bottom ${target.bottom}; frame top ${frame.top}, bottom ${frame.bottom})`,
  );
  check(
    cutOff(ring, frame) === 0,
    `the whole focus ring is inside the frame: ${cutOff(ring, frame)} px are cut off (ring top ${ring.top}, bottom ${ring.bottom}; frame top ${frame.top}, bottom ${frame.bottom})`,
  );
  const textGap = clearance(ring, boxOf(counter));
  check(
    textGap >= MIN_CLEAR - TOLERANCE,
    `the ring is ${MIN_CLEAR} px clear of the counter text: it is ${textGap}`,
  );
  const cardGap = clearance(ring, boxOf(card));
  check(
    cardGap >= MIN_CLEAR - TOLERANCE,
    `the ring is ${MIN_CLEAR} px clear of the card: it is ${cardGap}`,
  );
}
