import { Suspense, useCallback, useState } from "react";
import { isNewAccount, startAction, type OnboardingCounts } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { loadSpecimenCount } from "../../collection";
import { LoadFrame, useFeature, useInvalidate } from "../../kernel";
import type { SpeciesLookup } from "../onboarding-wizard/species-step/species-step";
import { OnboardingWizard } from "../onboarding-wizard/onboarding-wizard";
import { readStored, writeStored } from "../../platform/storage";
import type { LinkTarget } from "../../components/shared/navigation/nav-model/navigation/navigation";
import { FriendsBanner } from "../../social";
import { LockedRows } from "../unlock";

const COUNTS_KEY = ["start", "counts"];
const ACTIONS = "flex flex-col gap-3 sm:flex-row";

type Token = () => Promise<string | undefined>;
type Target = Extract<LinkTarget, "species" | "collection">;

const key = (accountId: string) => `pflanzendex.onboarding-skipped.${accountId}`;

/** Per-device convenience only: the counts are derived live, so nothing here can go stale. */
const readSkipped = (accountId: string): boolean => readStored(key(accountId)) === "1";
// Without storage the onboarding is simply offered again next time.
const writeSkipped = (accountId: string): void => void writeStored(key(accountId), "1");

function Overview(props: { counts: OnboardingCounts; onOpen: (t: Target) => void }) {
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
  accountId: string;
  counts: OnboardingCounts;
  onOpen: (t: Target) => void;
}) {
  const { accountId, counts } = props;
  const social = useFeature("social");
  const refresh = useInvalidate(COUNTS_KEY);
  const [skipped, setSkipped] = useState(() => readSkipped(accountId));
  // Leaving the guide (finished, skipped or ended) is remembered: switching tabs must not bring it back.
  const leave = () => {
    writeSkipped(accountId);
    setSkipped(true);
  };
  if (isNewAccount(counts) && !skipped)
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
  return (
    <>
      {social && (
        <Suspense fallback={null}>
          <FriendsBanner api={props.api} token={props.token} quiet requests />
        </Suspense>
      )}
      <Overview counts={counts} onOpen={props.onOpen} />
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
  accountId: string;
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
