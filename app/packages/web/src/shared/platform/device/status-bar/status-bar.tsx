// US-QS-25 · The status bar follows the page, also while a sheet or dialog dims it (issue 1691). The colours and the
// dimming itself are in theme-colour.ts; this file is the component that puts the dimming into a backdrop.
import * as React from "react";
import { dimStatusBar } from "./theme-colour";

/**
 * Put inside the overlay of a sheet or dialog (the backdrop). Radix mounts an overlay only while its window is open, so the
 * status bar is dimmed exactly as long as the backdrop is on screen. It draws nothing.
 */
export function StatusBarDim(): null {
  React.useEffect(() => dimStatusBar(), []);
  return null;
}
