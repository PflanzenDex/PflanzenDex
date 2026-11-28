import { SIZES, type Size } from "../one-screen/judge";

// The size sets of the one-screen gate (US-QG-02, owner decision d-190, issue 2666): ONE_SCREEN_SIZES decides which sizes of
// SIZES a run measures. `all` (unset) is every size, as `make one-screen` and the baseline write have always had it; `gate` is the
// six fit and cap sizes that a pull request and the blocking nightly run measure; `text200` is the 200 % text size alone, which
// the warning run of the nightly measures. The sizes of one screen (its own `sizes`) apply first, then the set.

export type SizeSet = "all" | "gate" | "text200";

export const SIZE_SETS: readonly SizeSet[] = ["all", "gate", "text200"];

/** The set that a value names: unset or empty is `all`; any other unknown value throws (the run never measures a guess). */
export function sizeSetOf(value: string | undefined): SizeSet {
  const text = value ?? "";
  if (text === "") return "all";
  if ((SIZE_SETS as readonly string[]).includes(text)) return text as SizeSet;
  throw new Error(`one-screen: ONE_SCREEN_SIZES "${text}" is not one of ${SIZE_SETS.join(", ")}`);
}

/** The sizes of `sizes` that a set keeps, in their order. */
export function sizesIn(set: SizeSet, sizes: readonly Size[] = SIZES): readonly Size[] {
  if (set === "all") return sizes;
  if (set === "gate") return sizes.filter((size) => size.kind !== "text200");
  return sizes.filter((size) => size.kind === "text200");
}

/** The set of this run: ONE_SCREEN_SIZES of the environment (CI and make pass it; unset means `all`). */
export function activeSizeSet(): SizeSet {
  return sizeSetOf(process.env["ONE_SCREEN_SIZES"]);
}
