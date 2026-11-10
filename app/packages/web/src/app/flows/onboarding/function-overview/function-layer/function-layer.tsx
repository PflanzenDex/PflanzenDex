import { Link } from "react-router";
import { Button } from "@/shared/ui/button/button";
import { Checkbox } from "@/shared/ui/fields/checkbox/checkbox";
import { LayerSheet } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { errorText } from "@/shared/lib/error-text";
import { cn } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import type { UnlockEntry } from "../../../unlock/model/unlock-api";
import {
  functionAddress,
  functionName,
  lockAddress,
  waysText,
} from "../../../unlock/model/unlock-texts";
import { useWriteAction } from "../../../../../shared/data";
import table from "../function-overview.de.json";
import { FUNCTION_PURPOSES } from "./function-purposes";

// The layer of one function of the overview (US-ONB-06, US-QS-15, US-ONB-09): its sentence, its way, its link and, for a
// feature outside the core, the keeper's switch. The texts come from the overview's message table.
const t = texts(table);
type Write = Pick<ReturnType<typeof useWriteAction>, "message" | "error" | "running">;
const LINK =
  "inline-flex min-h-[44px] items-center rounded-control px-1 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The state as a word, never by colour alone (NFR-13): open, locked, locked but openable by one tap (US-ONB-06), or switched
 * off by the keeper (US-ONB-09): "Ausgeschaltet" is neither locked nor "bald".
 */
export type OverviewState = "aktiv" | "freischaltbar" | "gesperrt" | "ausgeschaltet";

export const overviewState = (e: UnlockEntry): OverviewState =>
  e.state === "keeper_off"
    ? "ausgeschaltet"
    : e.state === "open"
      ? "aktiv"
      : e.mayUnlockNow
        ? "freischaltbar"
        : "gesperrt";

export const STATE_WORD: Record<OverviewState, string> = {
  aktiv: t("state.open"),
  freischaltbar: t("state.unlockable"),
  gesperrt: t("state.locked"),
  ausgeschaltet: t("state.off"),
};

/**
 * One function as its layer (US-QS-15): the sentence about its use, how it opens, its link and, when one tap may open
 * it, the one filled action "Jetzt freischalten". A feature outside the core has the keeper's switch (US-ONB-09); a core
 * feature says in one sentence why it has none. Its answer (the message or a refusal) shows in the layer (P-10).
 */
/** The keeper's switch of a feature outside the core (US-ONB-09): one box, and the sentence what switching does. */
function KeeperSwitch(props: {
  feature: string;
  off: boolean;
  disabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <>
      <Checkbox
        name={`keeper-${props.feature}`}
        checked={!props.off}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.checked)}
      >
        {t("keeper.label")}
      </Checkbox>
      <p className="m-0 text-sm text-muted-foreground">
        {props.off ? t("keeper.offHelp") : t("keeper.onHelp")}
      </p>
    </>
  );
}

/** The answer of the last write, as text: a status when it worked, an alert with the error text otherwise (P-10). */
function WriteNotes(props: Write) {
  return (
    <>
      {props.message && (
        <p role="status" className="m-0 rounded-lg border border-border p-3">
          {props.message}
        </p>
      )}
      {props.error && (
        <p role="alert" className="m-0 rounded-lg border border-destructive p-3 text-destructive">
          {errorText(props.error.code)}
        </p>
      )}
    </>
  );
}

/**
 * One function as its layer (US-QS-15): the sentence about its use, how it opens, its link and, when one tap may open
 * it, the one filled action "Jetzt freischalten". A feature outside the core has the keeper's switch (US-ONB-09); a core
 * feature says in one sentence why it has none. Its answer shows in the layer (P-10).
 */
export function FunctionLayer(props: {
  entry: UnlockEntry;
  write: Write;
  onUnlock: (id: string) => void;
  onKeeper: (feature: string, enabled: boolean, name: string) => void;
}) {
  const { entry, write } = props;
  const name = functionName(entry.id);
  const state = overviewState(entry);
  const off = state === "ausgeschaltet";
  const locked = state === "gesperrt" || state === "freischaltbar";
  const feature = entry.keeperSwitch;
  return (
    <LayerSheet
      id={`fn-${entry.id}`}
      title={name}
      primaryAction={
        state === "freischaltbar" ? (
          <Button
            type="button"
            className="w-full"
            aria-label={t("unlock.buttonAria", { name })}
            disabled={write.running}
            onClick={() => props.onUnlock(entry.id)}
          >
            {t("unlock.button")}
          </Button>
        ) : undefined
      }
    >
      <div className="flex min-w-0 flex-col gap-3">
        <p className="m-0">{FUNCTION_PURPOSES[entry.id]}</p>
        {feature === undefined ? (
          <p className="m-0 text-sm text-muted-foreground">{t("keeper.core")}</p>
        ) : (
          <KeeperSwitch
            feature={feature}
            off={off}
            disabled={write.running}
            onChange={(enabled) => props.onKeeper(feature, enabled, name)}
          />
        )}
        {locked && entry.ways.length > 0 && (
          <p className="m-0 text-sm text-muted-foreground">{t("way", { ways: waysText(entry) })}</p>
        )}
        {!off && (
          <Link
            to={locked ? lockAddress(entry.id) : functionAddress(entry.id)}
            aria-label={locked ? t("link.lookAria", { name }) : t("link.openAria", { name })}
            className={cn(LINK, "self-start")}
          >
            {locked ? t("link.look") : t("link.open")}
          </Link>
        )}
        <WriteNotes {...write} />
      </div>
    </LayerSheet>
  );
}
