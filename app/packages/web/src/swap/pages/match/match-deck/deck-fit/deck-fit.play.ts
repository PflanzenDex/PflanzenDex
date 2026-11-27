import { texts } from "@/shared/lib/text-rules/texts";
import { check, hasLayout, must } from "@/shared/testing/story-frame/story-play";
import { boxOf, settle, type Box } from "@/shared/testing/story-frame/table-measure";
import table from "../../../../swap.de.json";
import { OWNER } from "./deck-fit.frame";

const t = texts(table);

// What the play of the card of the match deck judges (US-QS-15, US-TAU-01, SG-TYPE-04, issue 2637): at 200 % text the card keeps
// the height of its content and the frame scrolls, instead of the card shrinking under its own text; at the normal text size the
// card takes the free height of the one-screen frame. It reads the real layout; jsdom has none, so the play returns before its
// first measure there.

export type TextSize = "normal" | "large";

/** The least height of a card whose content (picture, name, byline, facts) is whole: far above the 32 px of a squeezed card. */
const MIN_CARD = 150;
/**
 * At the normal size the card ends this close above the buttons, in px: the stack reserve of the card (16), the gap of the column
 * (8), the border and the padding of the row (9) and some room for rounding. A card that does not take the free height leaves
 * more.
 */
const MAX_GAP = 40;
/** Sub-pixel rounding of a box is no overlap. */
const TOLERANCE = 1;

const height = (box: Box) => box.bottom - box.top;

/** The parts of the deck the play measures: the card with its name and byline, and the three decision buttons below it. */
function partsOf(canvas: HTMLElement) {
  const card = must(
    canvas.querySelector("article[aria-labelledby='match-title']"),
    "the card of the deck",
  );
  const byline = t("card.byline", { name: OWNER });
  const buttons = [t("stamp.no"), t("stamp.later"), t("stamp.yes")].map((label) => ({
    label,
    element: must(canvas.querySelector(`button[aria-label^="${label}:"]`), `the button ${label}`),
  }));
  return {
    card,
    buttons,
    lines: [
      {
        label: "the name",
        element: must(card.querySelector("#match-title"), "the name of the card"),
      },
      {
        label: "the byline",
        element: must(
          Array.from(card.querySelectorAll("p")).find((line) => line.textContent === byline),
          "the byline of the card",
        ),
      },
    ],
    frame: must(canvas.querySelector("[data-fit-fill]"), "the frame of the page"),
  };
}

/**
 * The card of the deck in the frame of the page. At every size the card is whole (as high as its content, the name and the
 * byline inside it) and the decision buttons stand below it, never over it. At 200 % text the card is no lower than its content
 * and the frame scrolls; at the normal size the card takes the free height and the frame does not scroll.
 */
export async function judgeDeckFit(canvas: HTMLElement, size: TextSize): Promise<void> {
  const { card, lines, frame, ...rest } = partsOf(canvas);
  if (!hasLayout(card)) return;
  await settle();
  // The boxes are read after the layout has settled: a box read before the fonts are in and the text size is followed is stale.
  const buttons = rest.buttons.map(({ label, element }) => ({ label, box: boxOf(element) }));
  const box = boxOf(card);
  check(
    height(box) >= MIN_CARD,
    `the card is at least ${MIN_CARD} px high: it is ${height(box)} px (text ${size})`,
  );
  check(
    card.scrollHeight <= card.clientHeight + TOLERANCE,
    `the card is as high as its content: ${card.scrollHeight} px of content in ${card.clientHeight} px (text ${size})`,
  );
  for (const { label, element } of lines) {
    const line = boxOf(element);
    check(
      line.top >= box.top - TOLERANCE && line.bottom <= box.bottom + TOLERANCE,
      `${label} is inside the card: it spans ${line.top} to ${line.bottom} px, the card ${box.top} to ${box.bottom} px (text ${size})`,
    );
  }
  for (const { label, box: button } of buttons)
    check(
      button.top >= box.bottom - TOLERANCE,
      `the button ${label} is below the card: it starts at ${button.top} px, the card spans ${box.top} to ${box.bottom} px (text ${size})`,
    );
  // A button scrolls into the window of the frame, as it does for a keeper who reaches it by keyboard or by scrolling: none is cut off.
  for (const { label, element } of rest.buttons) {
    element.scrollIntoView({ block: "nearest" });
    const [button, shown] = [boxOf(element), boxOf(frame)];
    check(
      button.top >= shown.top - TOLERANCE && button.bottom <= shown.bottom + TOLERANCE,
      `the button ${label} is reachable: scrolled into view it spans ${button.top} to ${button.bottom} px, the frame ${shown.top} to ${shown.bottom} px (text ${size})`,
    );
  }
  if (size === "large") {
    check(
      frame.scrollHeight > frame.clientHeight + TOLERANCE,
      `at 200 % text the frame scrolls: ${frame.scrollHeight} px of content in ${frame.clientHeight} px`,
    );
    return;
  }
  check(
    frame.scrollHeight <= frame.clientHeight + TOLERANCE,
    `the frame does not scroll at the normal size: ${frame.scrollHeight} px of content in ${frame.clientHeight} px`,
  );
  const gap = Math.min(...buttons.map((button) => button.box.top)) - box.bottom;
  check(
    gap <= MAX_GAP,
    `the card takes the free height: ${gap} px lie between the card and the buttons (at most ${MAX_GAP})`,
  );
}
