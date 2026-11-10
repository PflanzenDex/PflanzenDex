import { Suspense, useLayoutEffect, useState, type ReactNode } from "react";
import { isNewAccount, type OnboardingCounts } from "@pflanzendex/core";
import { loadSpecimenCount } from "../../../../collection";
import { useFeature, useRequest, type Request } from "../../../../shared/data";
import { FriendsBanner } from "../../../../social";
import { HintNote } from "./hint";
import type { HintState } from "./hint/hint-api";
import { FirstPlantGuide } from "./first-plant-guide/first-plant-guide";
import { GuideEndNote } from "./first-plant-guide/guide-end-note/guide-end-note";
import type { SpeciesLookup } from "../onboarding-wizard/species-step/species-step";
import type { LinkTarget } from "../../../../shared/patterns/navigation/navigation/navigation";
import { useGuideEnd, useHints } from "./use-hints";

type Token = () => Promise<string | undefined>;
type Target = Extract<LinkTarget, "species" | "collection">;

const COUNTS_KEY = ["today", "intro-counts"];
const NOTE_OCCASIONS = ["first_plant_saved", "function_unlocked"] as const;

/** The count of the account for the intro; `undefined` while it loads or when it failed (the tasks then show alone). */
function useCounts(api: string, token: Token): Request<OnboardingCounts> {
  return useRequest({
    queryKey: COUNTS_KEY,
    token,
    load: async (t: string) => {
      const specimens = await loadSpecimenCount(api, t);
      if (!specimens.ok) return specimens;
      const counts: OnboardingCounts = {
        specimens: specimens.value.active,
        archivedSpecimens: specimens.value.archived,
      };
      return { ok: true as const, value: counts };
    },
  });
}

/**
 * Whether this visit has an answer of the count (issue 1795). The count of an earlier visit is served from the cache at
 * once, but it may predate a plant saved since, and a refresh that failed leaves it behind; neither is an answer. The
 * answer stays once it came, so a later refresh does not take the guide away while it is open.
 */
function useAnswered(count: Request<OnboardingCounts>): boolean {
  const fresh = count.status === "ready" && !count.offline && !count.refreshing;
  const [seen, setSeen] = useState(false);
  useLayoutEffect(() => {
    if (fresh) setSeen(true);
  }, [fresh]);
  return seen || fresh;
}

/**
 * Which part of the introduction shows now (issue 1244): nothing before the count, the guide in place of the tasks. A new
 * account is judged by the count only once this visit has it (`answered`, issue 1795): until then a copy that says "new"
 * waits while its refresh is on its way, and a copy that a failed refresh left behind shows the tasks.
 */
function stageOf(
  count: Request<OnboardingCounts>,
  answered: boolean,
  hints: HintState | "failed" | null,
  ended: boolean,
) {
  const counts = count.value;
  const copyNew = counts !== undefined && isNewAccount(counts);
  const waiting = copyNew && !answered && count.refreshing;
  const newAccount = copyNew && answered;
  // Undecided: the count, or the hints a new account is judged by, are still loading.
  const undecided = count.status === "pending" || waiting || (newAccount && hints === null);
  const guide = newAccount && hints !== null && !ended;
  return {
    undecided,
    guide,
    intro: counts !== undefined && !undecided && !guide,
    tasks: !undecided && !guide,
  };
}

/** The hint that may show as a note above the tasks, if one is due (US-ONB-07). */
function noteOf(hints: HintState | "failed" | null) {
  const hint = typeof hints === "object" && hints !== null ? hints.hint : null;
  return NOTE_OCCASIONS.find((o) => o === hint) ?? null;
}

/**
 * A wrapper that is hidden as a whole while `shown` is false and otherwise takes no box of its own (`contents`), so the
 * children keep their place in the layout of "Heute". It stays mounted, so its requests run without waiting for a
 * decision (issue 1244) and a change of visibility never remounts (and refetches) its content.
 */
function Shown(props: { shown: boolean; children: ReactNode }) {
  return (
    <div hidden={!props.shown} className={props.shown ? "contents" : undefined}>
      {props.children}
    </div>
  );
}

/** The quiet notices above the tasks: the friends' requests (when "social" is on) and the due hint. */
function Notes(props: {
  api: string;
  token: Token;
  social: boolean;
  note: ReturnType<typeof noteOf>;
  onGone: () => void;
}) {
  const { api, token } = props;
  return (
    <>
      {props.social && (
        <Suspense fallback={null}>
          {/* The new plants are a tile of the overview (issue 1156); only the requests stay a notice here. */}
          <FriendsBanner api={api} token={token} quiet requests news={false} />
        </Suspense>
      )}
      {props.note && (
        <Suspense fallback={null}>
          <HintNote occasion={props.note} api={api} token={token} onGone={props.onGone} />
        </Suspense>
      )}
    </>
  );
}

/**
 * The onboarding parts of the destination "Heute" (US-ONB-01, -05, -07, moved here by US-QS-16): a new account sees
 * the first-plant guide in place of the day's tasks (`children`); an account whose plants are all archived is a
 * returning keeper and gets the tasks. Otherwise the calm hint comes above the tasks; the locked functions are a tile of
 * the tasks (issue 1156).
 * Only the intro waits for the count: the tasks load at the same time (issue 1244) and stay hidden until the count
 * decides, so no task is shown in the wrong state and none waits for the count to start loading.
 * Counting fails open: when the count is not there the tasks show without the introduction (P-10 is kept by the tasks
 * themselves, which show their own error).
 */
export function TodayIntro(props: {
  /** Species search and profile, handed in by the app (the shell does not import the catalog). */
  lookup: SpeciesLookup;
  api: string;
  token: Token;
  onOpen: (t: Target) => void;
  /** Shown while the introduction is not decided yet (keeps the place of the tasks). */
  fallback: ReactNode;
  /** The day's tasks. */
  children: ReactNode;
}) {
  const { api, token } = props;
  const social = useFeature("social");
  const r = useCounts(api, token);
  const answered = useAnswered(r);
  const [hints, setHints] = useHints(api, token, r.value);
  const guide = useGuideEnd(api, token, hints);
  const stage = stageOf(r, answered, hints, guide.ended);
  return (
    <>
      {stage.undecided && props.fallback}
      {stage.guide && (
        <FirstPlantGuide
          lookup={props.lookup}
          api={api}
          token={token}
          counts={COUNTS_KEY}
          onOpen={props.onOpen}
          onLeave={guide.leave}
        />
      )}
      <Shown shown={stage.intro}>
        {guide.failed && <GuideEndNote error={guide.failed} onRetry={guide.retry} />}
        <Notes
          api={api}
          token={token}
          social={social}
          note={noteOf(hints)}
          onGone={() => setHints((h) => (typeof h === "object" && h ? { ...h, hint: null } : h))}
        />
      </Shown>
      {/* A lazy part of the tasks suspends only this boundary: the intro above mounts and asks for its count at once. */}
      <Shown shown={stage.tasks}>
        <Suspense fallback={props.fallback}>{props.children}</Suspense>
      </Shown>
    </>
  );
}
