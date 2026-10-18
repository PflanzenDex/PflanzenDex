import { useEffect, useState } from "react";
import { FIRST_PLANT_GUIDE, UNLOCK_FUNCTIONS, type OnboardingCounts } from "@pflanzendex/core";
import { useUnlocks } from "../unlock";
import { loadHints, saveHint, type HintState } from "./hint/hint-api";

type Token = () => Promise<string | undefined>;

/** The functions that are staged by a rule: when one of them is open, the rules opened it (US-ONB-07 `function_unlocked`). */
const STAGED = new Set<string>(
  UNLOCK_FUNCTIONS.filter((f) => f.rule !== "always" && f.rule !== "first_plant").map((f) => f.id),
);

/**
 * The occasions of the start page (US-ONB-07): the first plant exists, a staged function is open. The server decides
 * whether one is due.
 */
const applicableOf = (counts: OnboardingCounts, unlocked: boolean): string[] => [
  ...(counts.specimens === 1 ? ["first_plant_saved"] : []),
  ...(unlocked ? ["function_unlocked"] : []),
];

/**
 * The hint state and the end of the guide of the account (DM-ONB-03), read once per start page. `null` while loading;
 * a failed request fails open: no hint, and the guide counts as not ended, so nothing is held back (P-10).
 */
export function useHints(api: string, token: Token, counts: OnboardingCounts) {
  const [state, setState] = useState<HintState | "failed" | null>(null);
  const unlocks = useUnlocks();
  const unlocked = unlocks.entries.some((e) => e.state === "open" && STAGED.has(e.id));
  const key = applicableOf(counts, unlocked).join(",");
  useEffect(() => {
    let current = true;
    void (async () => {
      const t = await token();
      const r = t ? await loadHints(api, t, key ? key.split(",") : []) : null;
      if (current) setState(r?.ok ? r.value : "failed");
    })();
    return () => {
      current = false;
    };
  }, [api, token, key]);
  return [state, setState] as const;
}

/** Leaving the guide (finished, skipped or ended) is stored per account: switching tabs or devices must not bring it back. */
export function useGuideEnd(api: string, token: Token, hints: HintState | "failed" | null) {
  const [endedHere, setEndedHere] = useState(false);
  const leave = () => {
    setEndedHere(true);
    void (async () => {
      const t = await token();
      if (t) await saveHint(api, t, FIRST_PLANT_GUIDE, "dismissed");
    })();
  };
  return [
    endedHere || (typeof hints === "object" && hints !== null && hints.guideEnded),
    leave,
  ] as const;
}
