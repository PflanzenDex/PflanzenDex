import { check, hasLayout, must, waitUntil } from "@/shared/testing/story-frame/story-play";

/**
 * The measures of the meta line of an object row in the browser (US-QS-32, issue 2606, d-168). A play that calls them runs in
 * jsdom too, where the structure is checked and every measure passes: the conformance run and `make sb-test` judge the boxes.
 */

/** The meta line of the story's row, and the parts it holds (one span per " · " part). */
function metaBoxes(canvas: HTMLElement) {
  const line = must(canvas.querySelector<HTMLElement>("[data-row-meta]"), "the meta line");
  const parts = Array.from(line.querySelectorAll<HTMLElement>("[data-meta-part]"));
  check(parts.length > 1, `the meta line has ${parts.length} parts, a story needs several`);
  const style = getComputedStyle(line);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
  return { line, parts, lineHeight };
}

/** The box of one character of a text node. */
function charBox(node: Text, index: number): DOMRect {
  const range = document.createRange();
  range.setStart(node, index);
  range.setEnd(node, index + 1);
  return range.getBoundingClientRect();
}

/** The last `count` characters of a part, across its text nodes (an italic name and the text after it are two nodes). */
function lastChars(part: HTMLElement, count: number): { node: Text; index: number }[] {
  const walker = document.createTreeWalker(part, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) nodes.push(n as Text);
  const chars: { node: Text; index: number }[] = [];
  for (const node of nodes.reverse())
    for (let index = node.length - 1; index >= 0 && chars.length < count; index -= 1)
      chars.unshift({ node, index });
  return chars;
}

/** The text is at 200 % when the root font size is twice 16 px (the one-screen gate sets the same rule). */
export async function waitForText200(canvas: HTMLElement): Promise<void> {
  const line = must(canvas.querySelector<HTMLElement>("[data-row-meta]"), "the meta line");
  if (!hasLayout(line)) return;
  await waitUntil(
    () => parseFloat(getComputedStyle(document.documentElement).fontSize) >= 31,
    "the text is 200 %",
  );
}

/**
 * What every meta line keeps, whatever the width and the text size:
 * - it does not run sideways: neither the line nor a part leaves the column;
 * - a part breaks inside only when it is wider than the column, and then it takes the whole column;
 * - a dot stands on the line of the word before it, never at the start of a line.
 * `inside` names what the story shows: `none` when every part fits the column (the line breaks between the parts, over at least
 * two lines), `some` when at least one part is wider than the column and wraps at its own spaces.
 */
export function checkMetaLine(canvas: HTMLElement, inside: "none" | "some"): void {
  const { line, parts, lineHeight } = metaBoxes(canvas);
  if (!hasLayout(line)) return;
  const column = line.getBoundingClientRect();
  check(
    line.scrollWidth <= line.clientWidth + 1,
    `the meta line runs sideways (${line.scrollWidth} px in a column of ${line.clientWidth} px)`,
  );
  let wrapped = 0;
  parts.forEach((part, i) => {
    const box = part.getBoundingClientRect();
    check(
      box.left >= column.left - 1 && box.right <= column.right + 1,
      `part ${i + 1} leaves the column`,
    );
    const lines = Math.round(box.height / lineHeight);
    if (lines > 1) wrapped += 1;
    check(
      lines === 1 || box.width >= column.width - 1,
      `part ${i + 1} breaks inside (${lines} lines, ${box.width} px) though it is narrower than the column of ${column.width} px`,
    );
    // The dot ends its part (after a no-break space), so it must stand on the line of the character before the space.
    if (i === parts.length - 1) return;
    const [before, , dot] = lastChars(part, 3);
    check(before !== undefined && dot !== undefined, `part ${i + 1} does not end with a dot`);
    if (before === undefined || dot === undefined) return;
    const dotTop = charBox(dot.node, dot.index).top;
    const beforeTop = charBox(before.node, before.index).top;
    check(
      Math.abs(dotTop - beforeTop) < lineHeight / 2,
      `the dot after part ${i + 1} starts a line (${dotTop} px, the word before it ${beforeTop} px)`,
    );
  });
  if (inside === "some") check(wrapped > 0, "no part wraps inside, the story shows no wide part");
  else {
    check(wrapped === 0, `${wrapped} parts break inside though every part fits the column`);
    const rows = new Set(parts.map((part) => Math.round(part.getBoundingClientRect().top)));
    check(rows.size > 1, "the meta line is one line, the story shows no wrap between parts");
  }
}
