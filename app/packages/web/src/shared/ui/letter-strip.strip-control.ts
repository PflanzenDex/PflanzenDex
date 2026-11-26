import {
  useLayoutEffect,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { LETTERS, letterAt } from "./letter-strip.letters";

/**
 * How many letters apart the labels stand so that they do not touch: 1 while every letter fits, 2 when every other one does.
 * The 27 places share the strip equally and keep their count for the finger; only the labels thin out (a phone at 200 % text,
 * where a label is taller than its place). It is measured again when the strip or a label changes its size.
 */
export function useLabelStep(strip: RefObject<HTMLElement | null>): number {
  const [step, setStep] = useState(1);
  useLayoutEffect(() => {
    const box = strip.current;
    if (!box || typeof ResizeObserver !== "function") return;
    const label = box.firstElementChild?.firstElementChild ?? null;
    const measure = () => {
      const unit = label?.getBoundingClientRect().height ?? 0;
      const room = box.clientHeight;
      setStep(unit > 0 && room > 0 ? Math.max(1, Math.ceil((LETTERS.length * unit) / room)) : 1);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    if (label) observer.observe(label);
    measure();
    return () => observer.disconnect();
  }, [strip]);
  return step;
}

/**
 * What a touch and a key do on the strip: the letter it stands on, whether a finger is down, and the handlers that jump
 * (`onJump`) to the letter under the finger or to the next or previous letter that has an entry.
 */
export function useStripControl(
  strip: RefObject<HTMLElement | null>,
  present: ReadonlySet<string>,
  onJump: (letter: string) => void,
) {
  const letters = LETTERS.filter((l) => present.has(l));
  const [current, setCurrent] = useState<string | undefined>(letters[0]);
  const [dragging, setDragging] = useState(false);
  const jumpTo = (letter: string | undefined) => {
    if (letter === undefined) return;
    setCurrent(letter);
    onJump(letter);
  };
  const jumpAt = (event: PointerEvent) => {
    const rect = strip.current?.getBoundingClientRect();
    if (!rect || !(rect.height > 0)) return;
    jumpTo(letterAt((event.clientY - rect.top) / rect.height, present));
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const at = current === undefined ? -1 : letters.indexOf(current);
    const next = {
      ArrowDown: letters[Math.min(letters.length - 1, at + 1)],
      ArrowUp: letters[Math.max(0, at - 1)],
      Home: letters[0],
      End: letters.at(-1),
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    jumpTo(next);
  };
  const shown = current ?? letters[0];
  return {
    letters,
    shown,
    dragging,
    handlers: {
      onKeyDown,
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setDragging(true);
        jumpAt(event);
      },
      onPointerMove: (event: PointerEvent) => dragging && jumpAt(event),
      onPointerUp: () => setDragging(false),
      onPointerCancel: () => setDragging(false),
    },
  };
}
