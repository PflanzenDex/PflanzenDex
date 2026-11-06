import { useCallback } from "react";
import { Link } from "react-router";
import { Button } from "@/shared/ui/button/button";
import { PlantLoader } from "@/shared/patterns/states/plant-loader/plant-loader";
import { Pager } from "@/shared/patterns/responsive/pager/pager";
import { LayerOpenRow } from "@/shared/patterns/responsive/layer-sheet/layer-part/layer-part";
import { useOverviewPageSize } from "./overview-page-size/overview-page-size";
import { errorText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import { useInvalidate, useWriteAction } from "../../../../shared/data";
import { PATHS } from "../../../../shared/patterns/navigation/navigation/navigation";
import { setKeeperSwitch, unlockFunction, type UnlockEntry } from "../../unlock/model/unlock-api";
import { functionEmpty, functionName } from "../../unlock/model/unlock-texts";
import { UNLOCKS_KEY, useUnlocks } from "../../unlock/model/unlocks/unlocks";
import table from "./function-overview.de.json";
import { FunctionLayer, overviewState, STATE_WORD } from "./function-layer/function-layer";

const t = texts(table);
type Token = () => Promise<string | undefined>;

const LINK =
  "inline-flex min-h-[44px] items-center rounded-control px-1 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The entries the overview lists, in registry (navigation) order: everything the operator has not switched off and,
 * in calm mode, without the achievement functions (US-ONB-05). A function the keeper switched off is listed as
 * "Ausgeschaltet" with its switch, although it is never announced (US-ONB-09). The same for every style (US-ONB-06).
 */
export const overviewEntries = (entries: readonly UnlockEntry[]): readonly UnlockEntry[] =>
  entries.filter((e) => e.state !== "switched_off" && (e.announced || e.state === "keeper_off"));

/** A failed load stays visible with a retry (P-10). */
function FailedOverview(props: { code: string | undefined; retry: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">
        {errorText(props.code)}
      </p>
      <div>
        <Button type="button" onClick={props.retry}>
          {t("retry")}
        </Button>
      </div>
    </div>
  );
}

/** The writes of the overview: "Jetzt freischalten" and the keeper's switches (US-ONB-09); each refreshes the lock states. */
function useOverviewWrites(api: string, token: Token) {
  const refresh = useInvalidate(UNLOCKS_KEY);
  const write = useWriteAction(token, refresh);
  const { run } = write;
  const unlock = useCallback(
    (id: string) =>
      run(
        (tk) => unlockFunction(api, tk, id),
        t("unlock.done", { name: functionName(id), empty: functionEmpty(id) }).trim(),
      ),
    [run, api],
  );
  const keeper = useCallback(
    (feature: string, enabled: boolean, name: string) =>
      run(
        (tk) => setKeeperSwitch(api, tk, feature, enabled),
        enabled ? t("keeper.savedOn", { name }) : t("keeper.savedOff", { name }),
      ),
    [run, api],
  );
  return { write, unlock, keeper };
}

/**
 * The fixed overview "Was die App kann" (US-ONB-06, section "Funktionen" of "Konto"): every function with its state, one
 * sentence about its use and a link; the same list for style `few` and `many` and in the order of the navigation. Each row
 * names the function and its state and opens its layer; the list is in pages (US-QS-15). What the operator switched off is
 * not listed (FR-ONB-03). The keeper's switches sit in the layers (US-ONB-09): switching on or off is a write, and the lock
 * states are refreshed at once, so navigation and "Heute" follow. A failure stays visible with a retry (P-10); without
 * locked functions it says "Alles ist offen." and names the next step (P-09).
 */
function Overview(props: { api: string; token: Token }) {
  const size = useOverviewPageSize();
  const unlocks = useUnlocks();
  const { write, unlock, keeper } = useOverviewWrites(props.api, props.token);
  if (unlocks.status === "pending")
    return <PlantLoader label={t("loading")} size="lg" className="mx-auto my-8 flex" />;
  if (unlocks.status === "error")
    return <FailedOverview code={unlocks.errorCode} retry={unlocks.retry} />;
  const entries = overviewEntries(unlocks.entries);
  const allOpen = entries.every((e) => e.state === "open");
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {allOpen && (
        <p className="m-0">
          {t("allOpen")}{" "}
          <Link to={PATHS.today} className={LINK}>
            {t("allOpen.next")}
          </Link>
        </p>
      )}
      <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <Pager
            items={entries}
            pageSize={size}
            label={t("list.label")}
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
          <FunctionLayer
            key={e.id}
            entry={e}
            write={write}
            onUnlock={(id) => void unlock(id)}
            onKeeper={(feature, enabled, name) => void keeper(feature, enabled, name)}
          />
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
      <p className="m-0 text-sm text-muted-foreground">
        {t("version", { version: appVersion() || t("unknown") })}
      </p>
    </div>
  );
}
