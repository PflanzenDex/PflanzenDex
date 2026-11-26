import type { Found } from "../display/one-screen/judge.types";

// The reusable checks of the device check (US-DEV-01, issue 2504): what a check says, judged on values a flow or a screen
// measured. Pure: the browser reads the values (check.page.ts), this file decides. A check that fails names what it measured.

/** One judged property of a cell: its name, whether it holds, what was measured and, when it fails, what to look at. */
export interface Check {
  name: string;
  ok: boolean;
  measured: string;
  detail?: string;
}

/** A box in the window, in CSS pixels; `null` when a control is not shown (or not there). */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type Boxes = Record<string, Box | null>;

/** The px a control may move before it counts as moved (sub-pixel rounding). */
export const MOVE_TOLERANCE_PX = 1;

const px = (n: number) => `${Math.round(n)} px`;

/** Nothing moves under the finger: every named control that was shown before is still at its place after the action. */
export function stillCheck(before: Boxes, after: Boxes, tolerance = MOVE_TOLERANCE_PX): Check {
  const names = Object.keys(before).filter((n) => before[n] !== null);
  const moved: string[] = [];
  for (const name of names) {
    const a = before[name];
    const b = after[name];
    if (!a) continue;
    if (!b) {
      moved.push(`${name} is gone`);
      continue;
    }
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const parts: string[] = [];
    if (Math.abs(dx) > tolerance) parts.push(`${px(Math.abs(dx))} ${dx > 0 ? "right" : "left"}`);
    if (Math.abs(dy) > tolerance) parts.push(`${px(Math.abs(dy))} ${dy > 0 ? "down" : "up"}`);
    if (parts.length) moved.push(`${name} moved ${parts.join(" and ")}`);
  }
  return {
    name: "still: nothing moves under the finger",
    ok: moved.length === 0,
    measured: `${names.length} controls compared`,
    ...(moved.length ? { detail: moved.join("; ") } : {}),
  };
}

/** The page height did not change in the action (a result line that grows the layer moves what is below it). */
export function heightCheck(before: number, after: number, tolerance = MOVE_TOLERANCE_PX): Check {
  const delta = after - before;
  return {
    name: "still: the page height does not change",
    ok: Math.abs(delta) <= tolerance,
    measured: `${px(before)} before, ${px(after)} after`,
    ...(Math.abs(delta) > tolerance ? { detail: `the page grows or shrinks by ${px(delta)}` } : {}),
  };
}

/** The focus is on an element after the action: never on the body, and never nowhere. `active` is the description of the focused element. */
export function focusCheck(active: string | null): Check {
  const ok = active !== null && active !== "BODY";
  return {
    name: "focus: after an action the focus is not on the body",
    ok,
    measured: active ?? "none",
    ...(ok
      ? {}
      : {
          detail:
            "the focus fell to the page body, so a keyboard or a screen reader user starts again at the top",
        }),
  };
}

/** The announcement: one live region says the expected text (a result that is said, SG-FEED-04). */
export function liveCheck(texts: readonly string[], expected: string): Check {
  const ok = texts.some((t) => t.includes(expected));
  return {
    name: "live: the result is announced",
    ok,
    measured: texts.length ? texts.map((t) => `"${t.slice(0, 60)}"`).join(", ") : "no live text",
    ...(ok ? {} : { detail: `no aria-live region says "${expected}"` }),
  };
}

/** No toast for a success: the result shows in place and is announced (SG-FEED-01); a toast is an inserted box. */
export function toastCheck(count: number): Check {
  return {
    name: "no toast for a success",
    ok: count === 0,
    measured: `${count} toast${count === 1 ? "" : "s"}`,
    ...(count === 0
      ? {}
      : { detail: "a toast came up; a success shows in place and is announced" }),
  };
}

/** Horizontal overflow: the page or an element runs out of the window sideways (the findings of layoutProblems). */
export function overflowCheck(problems: readonly string[]): Check {
  const sideways = problems.filter((p) => /sideways|sticks out/.test(p));
  return {
    name: "overflow: no horizontal overflow",
    ok: sideways.length === 0,
    measured: `${sideways.length} sideways`,
    ...(sideways.length ? { detail: sideways.slice(0, 3).join("; ") } : {}),
  };
}

/** The size floors of judge.size.ts (a picture, a text box, a row, a name): one check, its failures named. */
export function floorCheck(found: readonly Found[]): Check {
  const sizes = found.filter(([rule]) => rule === "size").map(([, text]) => text);
  return {
    name: "floors: pictures, rows and names keep their size",
    ok: sizes.length === 0,
    measured: `${sizes.length} below the floor`,
    ...(sizes.length ? { detail: sizes.slice(0, 3).join("; ") } : {}),
  };
}

/** The text size of the cell holds: the root font size is twice the default at 200 %, the default otherwise (WCAG 1.4.4, PF-038). */
export function textCheck(rem: number, text: "100" | "200"): Check {
  const expected = text === "200" ? 32 : 16;
  const ok = Math.abs(rem - expected) < 0.5;
  return {
    name: `text: root font size is ${text} %`,
    ok,
    measured: `${rem.toFixed(1)} px`,
    ...(ok ? {} : { detail: `expected ${expected} px` }),
  };
}

/** A yes-or-no property of a cell (for example "navigator.onLine is true"): what was read is the measured value. */
export function boolCheck(name: string, ok: boolean, measured: string): Check {
  return { name, ok, measured, ...(ok ? {} : { detail: "the page reports otherwise" }) };
}

/** The failing checks of a set, in order. */
export function failing(checks: readonly Check[]): Check[] {
  return checks.filter((c) => !c.ok);
}
