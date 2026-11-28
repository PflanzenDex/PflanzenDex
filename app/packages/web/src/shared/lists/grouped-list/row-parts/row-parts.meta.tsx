import { Children, Fragment, isValidElement, type ReactNode } from "react";

/** The separator the callers put between the parts of a meta line, for example "Efeutute · Zone 2". */
const SEPARATOR = " · ";
/** A dot always ends its part and never starts one, so a line breaks after it and never before it (no-break space). */
const DOT = " ·";
/**
 * One part is an inline box as wide as its text and never wider than the column: it stays whole on a line when it fits and
 * moves to the next line as a whole when it does not. Only a part wider than the column wraps inside, at its own spaces
 * (`align-top` keeps the lines of such a part in the line of its neighbours).
 */
const PART = "inline-block max-w-full align-top";

/** The parts of a meta line: a string is cut at each " · ", any other node (an italic name) stays whole inside its part. */
function cut(items: ReactNode[]): ReactNode[][] {
  const parts: ReactNode[][] = [];
  let current: ReactNode[] = [];
  const close = () => {
    // The dot joins the text before it, so a part is one text node where it can be.
    const last = current[current.length - 1];
    if (typeof last === "string") current[current.length - 1] = `${last}${DOT}`;
    else current.push(DOT);
    parts.push(current);
    current = [];
  };
  for (const item of items) {
    if (typeof item !== "string") {
      current.push(item);
      continue;
    }
    item.split(SEPARATOR).forEach((text, i) => {
      if (i > 0) close();
      if (text !== "") current.push(text);
    });
  }
  // A text that ends with a separator has no part after it.
  if (current.length > 0) parts.push(current);
  return parts;
}

/** The content of a meta line as a list: a string, or the children of a fragment (an italic name and its text). */
function itemsOf(meta: ReactNode): ReactNode[] | null {
  if (typeof meta === "string") return [meta];
  if (isValidElement<{ children?: ReactNode }>(meta) && meta.type === Fragment)
    return Children.toArray(meta.props.children);
  return null;
}

/**
 * The meta line of a row or a card (issues 2606, 2640, d-168): the text is split at " · " and each part stays together, so the
 * line breaks between the parts and not inside one ("Zone 3 — 1" / "Pflanzen"). Every row of `GroupedRow` and `ObjectRow` runs
 * it, and so does a card that builds its own meta line (a hit of the catalog, a swap card, a measurement). It needs a container
 * in inline flow (a `p` or a `span` with text): a flex or grid container would turn each part into an item of its own. The separator stays at the end of the line before the
 * break, in the span of the part before it, and the only plain space is the one between two parts, where a break may fall.
 * The text of the line is the string of the caller, so the accessible name of the row keeps its order (WCAG 2.5.3); the space
 * before a dot is a no-break space, which reads and matches as a space. A fragment of elements and strings is split the same
 * way (the wish row: its scientific name in italics, then the text); any other node, and a text with one part, stays as given.
 */
export function metaParts(meta: ReactNode): ReactNode {
  const items = itemsOf(meta);
  if (items === null) return meta;
  const parts = cut(items);
  if (parts.length < 2) return meta;
  return parts.map((nodes, i) => (
    // The parts are a fixed list that never changes order, so the position is the key.
    <Fragment key={i}>
      {i > 0 && " "}
      <span data-meta-part="" className={PART}>
        {nodes}
      </span>
    </Fragment>
  ));
}
