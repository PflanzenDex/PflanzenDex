import { Fragment, type ReactNode } from "react";

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

/**
 * The meta line of an object row (issue 2606, d-168): the text is split at " · " and each part stays together, so the line breaks
 * between the parts and not inside one ("Zone 3 — 1" / "Pflanzen"). The separator stays at the end of the line before the
 * break, in the span of the part before it, and the only plain space is the one between two parts, where a break may fall.
 * The text of the line is the string of the caller, so the accessible name of the row keeps its order (WCAG 2.5.3); the space
 * before a dot is a no-break space, which reads and matches as a space. A text with one part is returned as it is.
 */
export function metaParts(text: string): ReactNode {
  const parts = text.split(SEPARATOR);
  if (parts.length < 2) return text;
  return parts.map((part, i) => (
    // The parts are a fixed list of strings that never changes order, so the position is the key.
    <Fragment key={i}>
      {i > 0 && " "}
      <span data-meta-part="" className={PART}>
        {i < parts.length - 1 ? `${part}${DOT}` : part}
      </span>
    </Fragment>
  ));
}
