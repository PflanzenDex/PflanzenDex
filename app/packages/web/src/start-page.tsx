import { useCallback, useState } from "react";
import { onboardingHints, startAction, type OnboardingCounts } from "@pflanzendex/core";
import { loadSpecimenCount } from "./collection";
import { LoadFrame } from "./kernel";
import { loadLocations, loadZones } from "./light";
import { OnboardingWizard } from "./onboarding-wizard";
import type { View } from "./navigation";

type Token = () => Promise<string | undefined>;
type Target = Extract<View, "species" | "light" | "collection" | "hints">;

const HINT_ACTION = { locations: "Standorte anlegen", zones: "Lichtzonen einrichten" } as const;

const key = (accountId: string) => `pflanzendex.onboarding-skipped.${accountId}`;

/** Per-device convenience only: the counts that drive the hints are derived live, so nothing here can go stale. */
function readSkipped(accountId: string): boolean {
  try {
    return window.localStorage.getItem(key(accountId)) === "1";
  } catch {
    return false;
  }
}
function writeSkipped(accountId: string): void {
  try {
    window.localStorage.setItem(key(accountId), "1");
  } catch {
    // Without storage the onboarding is simply offered again next time.
  }
}

function Overview(props: { counts: OnboardingCounts; onOpen: (t: Target) => void }) {
  const action = startAction(props.counts);
  const hints = onboardingHints(props.counts);
  return (
    <section aria-labelledby="start-title" className="start">
      <h1 id="start-title">Start</h1>
      {action ? (
        <div className="next-step">
          <h2>{action.title}</h2>
          <p>{action.nextAction}</p>
          <div className="actions">
            <button type="button" className="primary" onClick={() => props.onOpen("species")}>
              Art im Katalog wählen
            </button>
          </div>
        </div>
      ) : (
        <p>Deine Pflanzen warten im Bestand. Dort siehst du, was als Nächstes ansteht.</p>
      )}
      {!action && (
        <div className="actions">
          <button type="button" className="primary" onClick={() => props.onOpen("collection")}>
            Zum Bestand
          </button>
        </div>
      )}
      {hints.length > 0 && (
        <ul className="cards-grid" aria-label="Hinweise zur Einrichtung">
          {hints.map((h) => (
            <li key={h.id} className="specimen-card">
              <p>{h.text}</p>
              <p className="next-action">{h.nextAction}</p>
              <div className="actions">
                <button type="button" className="secondary" onClick={() => props.onOpen("light")}>
                  {HINT_ACTION[h.id]}
                </button>
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
  // Leaving the guide (finished, skipped or "later") is remembered: switching tabs must not bring it back.
  const leave = () => {
    writeSkipped(accountId);
    setSkipped(true);
  };
  if (counts.specimens === 0 && !skipped)
    return (
      <OnboardingWizard
        api={props.api}
        token={props.token}
        counts={counts}
        onChoosePlant={() => props.onOpen("species")}
        onFinish={leave}
        onLater={leave}
      />
    );
  return <Overview counts={counts} onOpen={props.onOpen} />;
}

/**
 * The start page (US-ACC-03). A new account is guided through locations, light zones and the first plant; every step
 * can be skipped. Afterwards the page never stays empty: without a plant it names the next action, skipped details
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
        specimens: specimens.value,
      };
      return { ok: true as const, value: counts };
    },
    [api],
  );
  return (
    <div className="light collection start-page">
      <LoadFrame token={props.token} load={load} loadingText="Start wird geladen …">
        {(counts: OnboardingCounts) => <Content {...props} counts={counts} />}
      </LoadFrame>
    </div>
  );
}
