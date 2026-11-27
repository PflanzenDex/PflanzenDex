import * as React from "react";

/**
 * A window shorter than this many root font sizes cannot hold the bar of a sheet, its title and a field of its form: 16 rem,
 * which is 256 px at the default text size and 512 px at 200 % text. The measure moves with the text size, because the
 * bar wraps and the title grows with it (US-QS-32, SG-SHEET-04).
 */
const CRAMPED_REM = 16;

/** The height the sheet lives in: the visual viewport, which a phone keyboard shrinks (SG-FORM-02), else the window. */
export const windowHeight = (): number => window.visualViewport?.height ?? window.innerHeight;

/**
 * Whether the window is too short for the sheet's full header (US-QS-32, SG-FORM-02): with the keyboard open at 200 % text
 * the grabber, the two rows of the bar and the title take more than the 90 % of the window the sheet may have, and no field
 * of the form is left to see. A cramped sheet with bar actions drops the grabber and reads its title to assistive technology
 * only, so the bar and the focused field stay in the window. Only a sheet that has bar actions (`active`) asks.
 */
export function useCrampedWindow(active: boolean): boolean {
  const [cramped, setCramped] = React.useState(false);
  React.useLayoutEffect(() => {
    if (!active) return;
    const viewport = window.visualViewport;
    const read = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setCramped(windowHeight() < CRAMPED_REM * rem);
    };
    read();
    window.addEventListener("resize", read);
    viewport?.addEventListener("resize", read);
    return () => {
      window.removeEventListener("resize", read);
      viewport?.removeEventListener("resize", read);
    };
  }, [active]);
  return active && cramped;
}
