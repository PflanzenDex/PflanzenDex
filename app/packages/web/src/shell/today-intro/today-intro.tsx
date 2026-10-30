import { Suspense, type ReactNode } from "react";
import { isNewAccount, type OnboardingCounts } from "@pflanzendex/core";
import { loadSpecimenCount } from "../../collection";
import { useFeature, useRequest } from "../../kernel";
import { FriendsBanner } from "../../social";
import { CollapsedLockedRows } from "../unlock/locked-rows/collapsed-rows/collapsed-rows";
import { HintNote } from "./hint";
import { FirstPlantGuide } from "./first-plant-guide/first-plant-guide";
import type { SpeciesLookup } from "../onboarding-wizard/species-step/species-step";
import type { LinkTarget } from "../../components/shared/navigation/nav-model/navigation/navigation";
import { useGuideEnd, useHints } from "./use-hints";

type Token = () => Promise<string | undefined>;
type Target = Extract<LinkTarget, "species" | "collection">;

const COUNTS_KEY = ["today", "intro-counts"];

function Content(props: {
  lookup: SpeciesLookup;
  api: string;
  token: Token;
  counts: OnboardingCounts;
  onOpen: (t: Target) => void;
  fallback: ReactNode;
  children: ReactNode;
}) {
  const { counts } = props;
  const social = useFeature("social");
  const [hints, setHints] = useHints(props.api, props.token, counts);
  const [ended, leave] = useGuideEnd(props.api, props.token, hints);
  if (isNewAccount(counts) && hints === null) return <>{props.fallback}</>;
  if (isNewAccount(counts) && !ended)
    return (
      <FirstPlantGuide
        lookup={props.lookup}
        api={props.api}
        token={props.token}
        counts={COUNTS_KEY}
        onOpen={props.onOpen}
        onLeave={leave}
      />
    );
  const due = typeof hints === "object" && hints !== null ? hints.hint : null;
  return (
    <>
      {social && (
        <Suspense fallback={null}>
          <FriendsBanner api={props.api} token={props.token} quiet requests />
        </Suspense>
      )}
      {(due === "first_plant_saved" || due === "function_unlocked") && (
        <Suspense fallback={null}>
          <HintNote
            occasion={due}
            api={props.api}
            token={props.token}
            onGone={() => setHints((h) => (typeof h === "object" && h ? { ...h, hint: null } : h))}
          />
        </Suspense>
      )}
      {props.children}
      <CollapsedLockedRows />
    </>
  );
}

/**
 * The onboarding parts of the destination "Heute" (US-ONB-01, -05, -07, moved here by US-QS-16): a new account sees
 * the first-plant guide in place of the day's tasks (`children`); an account whose plants are all archived is a
 * returning keeper and gets the tasks. Otherwise the calm hint comes above the tasks and the locked functions below.
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
  const { api } = props;
  const r = useRequest({
    queryKey: COUNTS_KEY,
    token: props.token,
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
  if (r.status === "pending") return <>{props.fallback}</>;
  if (r.value === undefined) return <>{props.children}</>;
  return <Content {...props} counts={r.value} />;
}
