import { useLayoutEffect, useRef, useState } from "react";

/**
 * The position in the deck and the focus that follows each move (SC 2.4.3): the heading of the view the keeper moved to
 * gets the focus, never the body. `takeFocus` is set for a deck the keeper asked for, which takes the focus on its first
 * view, because the button that had it is gone.
 */
export function useDeckPosition(takeFocus: boolean) {
  const [position, setPosition] = useState(0);
  const [moved, setMoved] = useState(takeFocus);
  const endTitle = useRef<HTMLHeadingElement>(null);
  const frontTitle = useRef<HTMLHeadingElement>(null);
  // A layout effect: the focus moves in the same commit that shows the new heading and removes the control that had the
  // focus. A passive effect leaves the focus on the body until React flushes it, so a read in that window (US-QS-14) saw none.
  useLayoutEffect(() => {
    // The heading of the new view: the end state, else the card in front (the next one or the one taken back).
    if (moved) (endTitle.current ?? frontTitle.current)?.focus();
  }, [position, moved]);
  const moves = {
    advance: () => {
      setPosition((p) => p + 1);
      setMoved(true);
    },
    back: () => {
      setPosition((p) => p - 1);
      setMoved(true);
    },
  };
  return { position, moves, endTitle, frontTitle };
}
