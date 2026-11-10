// US-QS-25 · The status bar follows the page, also while a sheet or dialog dims it (issue 1691). index.html names the
// `theme-color` of each colour scheme; the browser shows the one that matches the system scheme. While a backdrop is on
// screen both are set to the dimmed page colour, and back to the page background when the last backdrop has left.
// These are the browser's own colour values, not component styling, so they live in this module; the tests check them
// against tokens.css and index.html.

/** `--background` of each scheme in tokens.css (light on `:root`, dark under `prefers-color-scheme: dark`). */
export const PAGE_BACKGROUND = { light: "#fafafa", dark: "#0b0b0c" } as const;
/** `--foreground` of each scheme: the backdrop of a sheet or dialog is this colour (`bg-foreground/50`). */
export const PAGE_FOREGROUND = { light: "#18181b", dark: "#f4f4f5" } as const;
/** The opacity of the backdrop (`bg-foreground/50` in the sheet and dialog overlays). */
export const BACKDROP_OPACITY = 0.5;

type ColourScheme = keyof typeof PAGE_BACKGROUND;

const channels = (hex: string) => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
const toHex = (value: number) => value.toString(16).padStart(2, "0");

/** The page background under a backdrop: the foreground at the backdrop opacity, composited over it per sRGB channel. */
export function dimmedPageColour(scheme: ColourScheme): string {
  const top = channels(PAGE_FOREGROUND[scheme]);
  const bottom = channels(PAGE_BACKGROUND[scheme]);
  const mixed = top.map((value, i) =>
    Math.round(BACKDROP_OPACITY * value + (1 - BACKDROP_OPACITY) * (bottom[i] ?? 0)),
  );
  return `#${mixed.map(toHex).join("")}`;
}

const META = 'meta[name="theme-color"]';

/** Backdrops on screen. The status bar is dimmed while this is above zero, so it stays dim until the last one leaves. */
let backdrops = 0;

function schemeOf(meta: Element): ColourScheme | null {
  const media = meta.getAttribute("media") ?? "";
  if (media.includes("prefers-color-scheme: dark")) return "dark";
  if (media.includes("prefers-color-scheme: light")) return "light";
  return null;
}

/** Writes the page colour, or the dimmed one, into every `theme-color` meta, each one for its own scheme. */
function paintStatusBar(): void {
  for (const meta of document.querySelectorAll(META)) {
    const scheme = schemeOf(meta);
    if (!scheme) continue;
    const colour = backdrops > 0 ? dimmedPageColour(scheme) : PAGE_BACKGROUND[scheme];
    if (meta.getAttribute("content") !== colour) meta.setAttribute("content", colour);
  }
}

/** Dims the status bar with the page while a backdrop is on screen. The returned function ends this one dimming only. */
export function dimStatusBar(): () => void {
  backdrops += 1;
  paintStatusBar();
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    backdrops -= 1;
    paintStatusBar();
  };
}
