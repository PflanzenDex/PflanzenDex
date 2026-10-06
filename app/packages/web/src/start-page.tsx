import { useCallback, useState } from "react";
import {
  isNewAccount,
  onboardingHints,
  startAction,
  type OnboardingCounts,
} from "@pflanzendex/core";
import { Button } from "@/components/ui/button";
import { loadSpecimenCount } from "./collection";
import { LoadFrame } from "./kernel";
import { loadLocations, loadZones } from "./light";
import { OnboardingWizard } from "./onboarding-wizard";
import { readStored, writeStored } from "./platform/storage";
import type { View } from "./navigation";

const ACTIONS = "flex flex-col gap-3 sm:flex-row";

type Token = () => Promise<string | undefined>;
type Target = Extract<View, "species" | "light" | "collection" | "hints">;

const key = (accountId: string) => `pflanzendex.onboarding-skipped.${accountId}`;

/** Per-device convenience only: the counts that drive the hints are derived live, so nothing here can go stale. */
const readSkipped = (accountId: string): boolean => readStored(key(accountId)) === "1";
// Without storage the onboarding is simply offered again next time.
const writeSkipped = (accountId: string): void => void writeStored(key(accountId), "1");

function Overview(props: { counts: OnboardingCounts; onOpen: (t: Target) => void }) {
  const action = startAction(props.counts);
  const hints = onboardingHints(props.counts);
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
      {hints.length > 0 && (
        <ul className="m-0 grid list-none gap-3 p-0" aria-label="Hinweise zur Einrichtung">
          {hints.map((h) => (
            <li
              key={h.id}
              className="grid min-w-0 content-start gap-1 break-words rounded-xl border border-border bg-card p-3 text-card-foreground"
            >
              <p>{h.text}</p>
              <p className="text-sm text-muted-foreground">{h.nextAction}</p>
              <div className={ACTIONS}>
                <Button type="button" variant="secondary" onClick={() => props.onOpen("light")}>
                  {h.actionLabel}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Content(props: {
  api: string;
  token: Token;
  accountId: string;
  counts: OnboardingCounts;
  onOpen: (t: Target) => void;
}) {
  const { accountId, counts } = props;
  const [skipped, setSkipped] = useState(() => readSkipped(accountId));
  // Leaving the guide (finished, skipped or ended) is remembered: switching tabs must not bring it back.
  const leave = () => {
    writeSkipped(accountId);
    setSkipped(true);
  };
  if (isNewAccount(counts) && !skipped)
    return (
      <OnboardingWizard
        api={props.api}
        token={props.token}
        counts={counts}
        onChoosePlant={() => props.onOpen("species")}
        onFinish={leave}
        onEnd={leave}
      />
    );
  return <Overview counts={counts} onOpen={props.onOpen} />;
}

/**
 * The start page (US-ACC-03). A new account is guided through locations, light zones and the first plant; every step
 * can be skipped. An account whose plants are all archived is a returning keeper and gets the overview, not the guide. Afterwards the page never stays empty: without a plant it names the next action, skipped details
 * come back as hints (P-09), never as an error.
 */
export function StartPage(props: {
  api: string;
  token: Token;
  accountId: string;
  onOpen: (t: Target) => void;
}) {
  const { api } = props;
  const load = useCallback(
    async (t: string) => {
      const [zones, locations, specimens] = await Promise.all([
        loadZones(api, t),
        loadLocations(api, t),
        loadSpecimenCount(api, t),
      ]);
      if (!zones.ok) return zones;
      if (!locations.ok) return locations;
      if (!specimens.ok) return specimens;
      const counts: OnboardingCounts = {
        zones: zones.value.length,
        locations: locations.value.length,
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
        queryKey={["start", "counts"]}
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
