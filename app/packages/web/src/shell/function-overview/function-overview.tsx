import { useCallback } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button/button";
import { PlantLoader } from "@/components/shared/states/plant-loader/plant-loader";
import { errorText } from "@/lib/error-text";
import { useInvalidate, useWriteAction } from "../../kernel";
import { PATHS } from "../../components/shared/navigation/nav-model/navigation/navigation";
import { unlockFunction, type UnlockEntry } from "../unlock/model/unlock-api";
import {
  functionAddress,
  functionEmpty,
  functionName,
  lockAddress,
  waysText,
} from "../unlock/model/unlock-texts";
import { UNLOCKS_KEY, useUnlocks } from "../unlock/model/unlocks/unlocks";
import { FUNCTION_PURPOSES } from "./function-purposes";

type Token = () => Promise<string | undefined>;

const LINK =
  "inline-flex min-h-[44px] items-center rounded-control px-1 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** The state as a word, never by colour alone (NFR-13): open, locked, or locked but openable by one tap (US-ONB-06). */
export type OverviewState = "aktiv" | "freischaltbar" | "gesperrt";

export const overviewState = (e: UnlockEntry): OverviewState =>
  e.state === "open" ? "aktiv" : e.mayUnlockNow ? "freischaltbar" : "gesperrt";

/**
 * The entries the overview lists, in registry (navigation) order: everything the operator has not switched off and,
 * in calm mode, without the achievement functions (US-ONB-05). The same for every style (US-ONB-06).
 */
export const overviewEntries = (entries: readonly UnlockEntry[]): readonly UnlockEntry[] =>
  entries.filter((e) => e.state !== "switched_off" && e.announced);

function Row(props: { entry: UnlockEntry; running: boolean; onUnlock: (id: string) => void }) {
  const { entry } = props;
  const name = functionName(entry.id);
  const state = overviewState(entry);
  const locked = state !== "aktiv";
  return (
    <li className="flex flex-col gap-1 rounded-control border border-border p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="m-0 text-base font-semibold">{name}</h3>
        <span className="rounded-control border border-border px-2 text-sm font-semibold">
          {state === "aktiv" ? "Aktiv" : state === "freischaltbar" ? "Freischaltbar" : "Gesperrt"}
        </span>
      </div>
      <p className="m-0">{FUNCTION_PURPOSES[entry.id]}</p>
      {locked && (
        <p className="m-0 text-sm text-muted-foreground">
          {entry.ways.length > 0 ? `Öffnet sich von selbst: ${waysText(entry)}.` : null}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3">
        <Link
          to={locked ? lockAddress(entry.id) : functionAddress(entry.id)}
          aria-label={locked ? `${name}: Seite ansehen` : `${name} öffnen`}
          className={LINK}
        >
          {locked ? "Ansehen" : "Öffnen"}
        </Link>
        {state === "freischaltbar" && (
          <Button
            type="button"
            variant="secondary"
            aria-label={`${name}: Jetzt freischalten`}
            disabled={props.running}
            onClick={() => props.onUnlock(entry.id)}
          >
            Jetzt freischalten
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * The fixed overview "Was die App kann" (US-ONB-06, section of "Konto"): every function with its state, one sentence
 * about its use and a link; the same list for style `few` and `many` and in the order of the navigation. What the
 * operator switched off is not listed (FR-ONB-03). A failure stays visible with a retry (P-10); without locked
 * functions it says "Alles ist offen." and names the next step (P-09).
 */
export default function FunctionOverview(props: { api: string; token: Token }) {
  const unlocks = useUnlocks();
  const refresh = useInvalidate(UNLOCKS_KEY);
  const write = useWriteAction(props.token, refresh);
  const { run } = write;
  const unlock = useCallback(
    (id: string) =>
      run(
        (t) => unlockFunction(props.api, t, id),
        `${functionName(id)} ist jetzt freigeschaltet. ${functionEmpty(id)}`.trim(),
      ),
    [run, props.api],
  );
  if (unlocks.status === "pending")
    return (
      <PlantLoader label="Funktionen werden geladen …" size="lg" className="mx-auto my-8 flex" />
    );
  if (unlocks.status === "error")
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">
          {errorText(unlocks.errorCode)}
        </p>
        <div>
          <Button type="button" onClick={unlocks.retry}>
            Erneut versuchen
          </Button>
        </div>
      </div>
    );
  const entries = overviewEntries(unlocks.entries);
  const allOpen = entries.every((e) => e.state === "open");
  return (
    <div className="flex flex-col gap-3">
      {write.message && (
        <p role="status" className="rounded-lg border border-border p-3">
          {write.message}
        </p>
      )}
      {write.error && (
        <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">
          {errorText(write.error.code)}
        </p>
      )}
      {allOpen && (
        <p className="m-0">
          Alles ist offen.{" "}
          <Link to={PATHS.today} className={LINK}>
            Weiter zu Heute
          </Link>
        </p>
      )}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {entries.map((e) => (
          <Row key={e.id} entry={e} running={write.running} onUnlock={(id) => void unlock(id)} />
        ))}
      </ul>
    </div>
  );
}
