import { useCallback } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button/button";
import { PlantLoader } from "@/components/shared/states/plant-loader/plant-loader";
import { LAYER_SLOT, LayerSheet } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { LayerOpenRow } from "@/components/shared/responsive/layer-sheet/layer-part/layer-part";
import { Pager } from "@/components/shared/responsive/pager/pager";
import { useOverviewPageSize } from "./overview-page-size/overview-page-size";
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
type Write = Pick<ReturnType<typeof useWriteAction>, "message" | "error" | "running">;

const LINK =
  "inline-flex min-h-[44px] items-center rounded-control px-1 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** The state as a word, never by colour alone (NFR-13): open, locked, or locked but openable by one tap (US-ONB-06). */
export type OverviewState = "aktiv" | "freischaltbar" | "gesperrt";

export const overviewState = (e: UnlockEntry): OverviewState =>
  e.state === "open" ? "aktiv" : e.mayUnlockNow ? "freischaltbar" : "gesperrt";

const STATE_WORD: Record<OverviewState, string> = {
  aktiv: "Aktiv",
  freischaltbar: "Freischaltbar",
  gesperrt: "Gesperrt",
};

/**
 * The entries the overview lists, in registry (navigation) order: everything the operator has not switched off and,
 * in calm mode, without the achievement functions (US-ONB-05). The same for every style (US-ONB-06).
 */
export const overviewEntries = (entries: readonly UnlockEntry[]): readonly UnlockEntry[] =>
  entries.filter((e) => e.state !== "switched_off" && e.announced);

/**
 * One function as its layer (US-QS-15): the sentence about its use, how it opens, its link and, when one tap may open
 * it, the one filled action "Jetzt freischalten". Its answer (the message or a refusal) shows in the layer (P-10).
 */
function FunctionLayer(props: {
  entry: UnlockEntry;
  write: Write;
  onUnlock: (id: string) => void;
}) {
  const { entry, write } = props;
  const name = functionName(entry.id);
  const state = overviewState(entry);
  const locked = state !== "aktiv";
  return (
    <LayerSheet
      id={`fn-${entry.id}`}
      title={name}
      primaryAction={
        state === "freischaltbar" ? (
          <Button
            type="button"
            className="w-full"
            aria-label={`${name}: Jetzt freischalten`}
            disabled={write.running}
            onClick={() => props.onUnlock(entry.id)}
          >
            Jetzt freischalten
          </Button>
        ) : undefined
      }
    >
      <div className="flex min-w-0 flex-col gap-3">
        <p className="m-0">{FUNCTION_PURPOSES[entry.id]}</p>
        {locked && entry.ways.length > 0 && (
          <p className="m-0 text-sm text-muted-foreground">
            {`Öffnet sich von selbst: ${waysText(entry)}.`}
          </p>
        )}
        <Link
          to={locked ? lockAddress(entry.id) : functionAddress(entry.id)}
          aria-label={locked ? `${name}: Seite ansehen` : `${name} öffnen`}
          className={`${LINK} self-start`}
        >
          {locked ? "Ansehen" : "Öffnen"}
        </Link>
        {write.message && (
          <p role="status" className="m-0 rounded-lg border border-border p-3">
            {write.message}
          </p>
        )}
        {write.error && (
          <p role="alert" className="m-0 rounded-lg border border-destructive p-3 text-destructive">
            {errorText(write.error.code)}
          </p>
        )}
      </div>
    </LayerSheet>
  );
}

/** A failed load stays visible with a retry (P-10). */
function FailedOverview(props: { code: string | undefined; retry: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">
        {errorText(props.code)}
      </p>
      <div>
        <Button type="button" onClick={props.retry}>
          Erneut versuchen
        </Button>
      </div>
    </div>
  );
}

/**
 * The fixed overview "Was die App kann" (US-ONB-06, section of "Konto"): every function with its state, one sentence
 * about its use and a link; the same list for style `few` and `many` and in the order of the navigation. Each row names
 * the function and its state and opens its layer; the list is in pages (US-QS-15). What the operator switched off is not
 * listed (FR-ONB-03). A failure stays visible with a retry (P-10); without locked functions it says "Alles ist offen."
 * and names the next step (P-09).
 */
function Overview(props: { api: string; token: Token }) {
  const size = useOverviewPageSize();
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
    return <FailedOverview code={unlocks.errorCode} retry={unlocks.retry} />;
  const entries = overviewEntries(unlocks.entries);
  const allOpen = entries.every((e) => e.state === "open");
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {allOpen && (
        <p className="m-0">
          Alles ist offen.{" "}
          <Link to={PATHS.today} className={LINK}>
            Weiter zu Heute
          </Link>
        </p>
      )}
      <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <Pager
            items={entries}
            pageSize={size}
            label="Funktionen"
            getKey={(e) => e.id}
            renderItem={(e) => (
              <LayerOpenRow
                id={`fn-${e.id}`}
                title={functionName(e.id)}
                value={STATE_WORD[overviewState(e)]}
              />
            )}
          />
        </div>
        {entries.map((e) => (
          <div key={e.id} className={LAYER_SLOT}>
            <FunctionLayer entry={e} write={write} onUnlock={(id) => void unlock(id)} />
          </div>
        ))}
      </div>
    </div>
  );
}

const appVersion = () =>
  (import.meta.env as Record<string, string | undefined>)["VITE_APP_VERSION"];

/** The overview and below it the version of the app, which no page footer shows any more (US-QS-17, P-08). */
export default function FunctionOverview(props: { api: string; token: Token }) {
  return (
    <div className="flex flex-col gap-6">
      <Overview {...props} />
      <p className="m-0 text-sm text-muted-foreground">Version {appVersion() || "unbekannt"}</p>
    </div>
  );
}
