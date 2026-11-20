import { useEffect, useState } from "react";
import { FIRST_PLANT_GUIDE, UNLOCK_FUNCTIONS, type OnboardingCounts } from "@pflanzendex/core";
import { useUnlocks } from "../../unlock";
import type { ApiError } from "../../../../shared/data";
import { loadHints, saveHint, type HintState } from "./hint/hint-api";
import { HintNote } from "./hint";

type Token = () => Promise<string | undefined>;

/** The functions that are staged by a rule: when one of them is open, the rules opened it (US-ONB-07 `function_unlocked`). */
const STAGED = new Set<string>(
  UNLOCK_FUNCTIONS.filter((f) => f.rule !== "always" && f.rule !== "first_plant").map((f) => f.id),
);

/**
 * The occasions of Heute (US-ONB-07): the first plant exists, a staged function is open. The server decides
 * whether one is due.
 */
const applicableOf = (counts: OnboardingCounts, unlocked: boolean): string[] => [
  ...(counts.specimens === 1 ? ["first_plant_saved"] : []),
  ...(unlocked ? ["function_unlocked"] : []),
];

/**
 * The hint state and the end of the guide of the account (DM-ONB-03), read once per visit of Heute. `null` while loading
 * or while the count the occasions depend on is not there (nothing is asked before it is known, issue 1244); a failed
 * request fails open: no hint, and the guide counts as not ended, so nothing is held back (P-10).
 */
export function useHints(api: string, token: Token, counts: OnboardingCounts | undefined) {
  const [state, setState] = useState<HintState | "failed" | null>(null);
  const unlocks = useUnlocks();
  const unlocked = unlocks.entries.some((e) => e.state === "open" && STAGED.has(e.id));
  const key = counts === undefined ? null : applicableOf(counts, unlocked).join(",");
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
  const store = async () => {
    const t = await token();
    const r = t ? await saveHint(api, t, FIRST_PLANT_GUIDE, "dismissed") : null;
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

/** The code of a due note is in hand before Heute shows (issue 2230): a lazy note would arrive after the tasks. */
export function useNoteCode(note: "first_plant_saved" | "function_unlocked" | null): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (note === null) return;
    let alive = true;
    const done = () => {
      if (alive) setReady(true);
    };
    void HintNote.load().then(done, done);
    return () => {
      alive = false;
    };
  }, [note]);
  return note === null || ready || HintNote.loaded() !== null;
}
