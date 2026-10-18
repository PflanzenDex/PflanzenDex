import { Suspense, type ReactNode, useCallback } from "react";
import { isNewAccount, startAction, type OnboardingCounts } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { loadSpecimenCount } from "../../collection";
import { LoadFrame, useFeature, useInvalidate } from "../../kernel";
import type { SpeciesLookup } from "../onboarding-wizard/species-step/species-step";
import { OnboardingWizard } from "../onboarding-wizard/onboarding-wizard";
import type { LinkTarget } from "../../components/shared/navigation/nav-model/navigation/navigation";
import { FriendsBanner } from "../../social";
import { LockedRows } from "../unlock";
import { HintNote } from "./hint";
import { useGuideEnd, useHints } from "./use-hints";

const COUNTS_KEY = ["start", "counts"];
const ACTIONS = "flex flex-col gap-3 sm:flex-row";

type Token = () => Promise<string | undefined>;
type Target = Extract<LinkTarget, "species" | "collection">;

function Overview(props: {
  counts: OnboardingCounts;
  hint?: ReactNode;
  onOpen: (t: Target) => void;
}) {
  const action = startAction(props.counts);
  return (
    <section aria-labelledby="start-title" className="flex flex-col gap-3">
      <h1 id="start-title" className="text-2xl font-semibold">
        Start
      </h1>
      {action ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">{action.title}</h2>
          <p>{action.nextAction}</p>
          <div className={ACTIONS}>
            <Button type="button" onClick={() => props.onOpen("species")}>
              {action.actionLabel}
            </Button>
          </div>
        </div>
      ) : (
        <p>Deine Pflanzen warten im Bestand. Dort siehst du, was als Nächstes ansteht.</p>
      )}
      {props.hint}
      {!action && (
        <div className={ACTIONS}>
          <Button type="button" onClick={() => props.onOpen("collection")}>
            Zum Bestand
          </Button>
        </div>
      )}
    </section>
  );
}

function Content(props: {
  lookup: SpeciesLookup;
  api: string;
  token: Token;
  counts: OnboardingCounts;
  onOpen: (t: Target) => void;
}) {
  const { counts } = props;
  const social = useFeature("social");
  const refresh = useInvalidate(COUNTS_KEY);
  const [hints, setHints] = useHints(props.api, props.token, counts);
  const [ended, leave] = useGuideEnd(props.api, props.token, hints);
  if (isNewAccount(counts) && hints === null) return <p role="status">Start wird geladen …</p>;
  if (isNewAccount(counts) && !ended)
    return (
      <OnboardingWizard
        lookup={props.lookup}
        api={props.api}
        token={props.token}
        onChoosePlant={() => props.onOpen("species")}
        onSkip={leave}
        onCreated={() => {
          leave();
          refresh();
          props.onOpen("collection");
        }}
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
      <Overview
        counts={counts}
        onOpen={props.onOpen}
        hint={
          due === "first_plant_saved" || due === "function_unlocked" ? (
            <Suspense fallback={null}>
              <HintNote
                occasion={due}
                api={props.api}
                token={props.token}
                onGone={() =>
                  setHints((h) => (typeof h === "object" && h ? { ...h, hint: null } : h))
                }
              />
            </Suspense>
          ) : null
        }
      />
      <LockedRows />
    </>
  );
}

/**
 * The start page (US-ACC-03, US-ONB-01). A new account starts with its first plant: species, light need from the
 * species, save; no location and no light zone is asked. An account whose plants are all archived is a returning
 * keeper and gets the overview, not the guide. Afterwards the page never stays empty: without a plant it names the
 * next action (P-09); nothing is shown as missing for a location or light zone.
 */
export function StartPage(props: {
  /** Species search and profile, handed in by the app (the shell does not import the catalog). */
  lookup: SpeciesLookup;
  api: string;
  token: Token;
  onOpen: (t: Target) => void;
}) {
  const { api } = props;
  const load = useCallback(
    async (t: string) => {
      const specimens = await loadSpecimenCount(api, t);
      if (!specimens.ok) return specimens;
      const counts: OnboardingCounts = {
        specimens: specimens.value.active,
        archivedSpecimens: specimens.value.archived,
      };
      return { ok: true as const, value: counts };
    },
    [api],
  );
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card px-4 py-6 text-card-foreground md:p-7">
      <LoadFrame
        queryKey={COUNTS_KEY}
        token={props.token}
        load={load}
        loadingText="Start wird geladen …"
        heading="Start"
      >
        {(counts: OnboardingCounts) => <Content {...props} counts={counts} />}
      </LoadFrame>
    </div>
  );
}
