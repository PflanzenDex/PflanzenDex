import { accountKey, useRepeatKey } from "@/shared/data";
import { useEffect, useState } from "react";
import { FIRST_PLANT_GUIDE, UNLOCK_FUNCTIONS, type OnboardingCounts } from "@pflanzendex/core";
import { useUnlocks } from "../../unlock";
import type { ApiError } from "../../../../shared/data";
import { loadHints, saveHint, type HintState } from "./hint/hint-api";

type Token = () => Promise<string | undefined>;

/** The functions that are staged by a rule: when one of them is open, the rules opened it (US-ONB-07 `function_unlocked`). */
const STAGED = new Set<string>(
  UNLOCK_FUNCTIONS.filter((f) => f.rule !== "always" && f.rule !== "first_plant").map((f) => f.id),
);

/**
 * The occasions of Heute (US-ONB-07): a staged function is open, and only that one (the plant occasions are notes of the
 * plant layer). The server decides whether it is due.
 */
const applicableOf = (unlocked: boolean): string[] => (unlocked ? ["function_unlocked"] : []);

/**
 * The hint state and the end of the guide of the account (DM-ONB-03), read once per visit of Heute. `null` while loading
 * or while the count is not there (nothing is asked before it is known, issue 1244); a failed
 * request fails open: no hint, and the guide counts as not ended, so nothing is held back (P-10).
 */
export function useHints(api: string, token: Token, counts: OnboardingCounts | undefined) {
  const [state, setState] = useState<HintState | "failed" | null>(null);
  const unlocks = useUnlocks();
  const unlocked = unlocks.entries.some((e) => e.state === "open" && STAGED.has(e.id));
  const key = counts === undefined ? null : applicableOf(unlocked).join(",");
  useEffect(() => {
    if (key === null) return;
    let current = true;
    // A token that cannot be read or a request that throws ends as "failed" too (P-10): the state never stays null, because
    // the intro holds the tasks while it is null (issue 2230).
    const answer = (async () => {
      const t = await token();
      return t ? loadHints(api, t, key ? key.split(",") : []) : null;
    })().catch(() => null);
    void answer.then((r) => {
      if (current) setState(r?.ok ? r.value : "failed");
    });
    return () => {
      current = false;
    };
  }, [api, token, key]);
  return [state, setState] as const;
}

/** Without a token the end cannot be sent; the keeper is asked to sign in again (P-10). */
const NOT_SIGNED_IN: ApiError = { code: "access.not_signed_in", text: "" };

/**
 * Leaving the guide (finished, skipped or ended) is stored per account: switching tabs or devices must not bring it back.
 * An end that is not stored is not dropped (P-10): `failed` keeps its refusal until `retry` stores the end (issue 1803).
 */
export function useGuideEnd(api: string, token: Token, hints: HintState | "failed" | null) {
  const [endedHere, setEndedHere] = useState(false);
  const [failed, setFailed] = useState<ApiError | null>(null);
  const keys = useRepeatKey();
  const store = async () => {
    const t = await token();
    const r = t
      ? await keys.run(
          (key) => saveHint(api, t, { occasion: FIRST_PLANT_GUIDE, state: "dismissed" }, { key }),
          accountKey(`guide-end:${FIRST_PLANT_GUIDE}`),
        )
      : null;
    setFailed(r === null ? NOT_SIGNED_IN : r.ok ? null : r.error);
  };
  return {
    ended: endedHere || (typeof hints === "object" && hints !== null && hints.guideEnded),
    failed,
    leave: () => {
      setEndedHere(true);
      void store();
    },
    retry: () => void store(),
  };
}
