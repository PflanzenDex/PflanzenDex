import { useId, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { NetworkReason, useNetworkGate, type NetworkGate } from "@/shared/ui/button.network-gate";
import { Switch } from "@/shared/ui/switch";
import { HAIRLINE } from "../grouped-list/group-classes";

export type SwitchRowProps = {
  /** The name of the setting, worded so that "on" means the named thing happens (SG-CTRL-05). It wraps and is never cut. */
  label: ReactNode;
  /** The one secondary line under the label: what the switch does and who sees what (14 px, muted; SG-COPY-05). */
  help?: ReactNode;
  /** The stored state. The row is controlled: a refused save leaves it where it was (P-10). */
  checked: boolean;
  /** The keeper turns the switch; the caller saves at once (SG-CTRL-02). Not called while the row is `busy` or offline. */
  onCheckedChange: (checked: boolean) => void;
  name?: string | undefined;
  /** A picture or an icon at the leading edge, for example the 56 px thumbnail of a plant (SG-LIST-03). */
  leading?: ReactNode;
  /** A save runs: the switch is `aria-disabled`, not `disabled`, so it keeps the focus (issue 2317); a change meanwhile is dropped. */
  busy?: boolean | undefined;
  /** The text of a refused save, shown at the row and linked to the switch (P-10, SG-FEED-02). */
  error?: ReactNode;
  /**
   * The switch writes at once (US-QS-30): offline it keeps its state, is shown inactive and names the reason, in a
   * `NetworkSlot` once below its group or on its own line.
   */
  needsNetwork?: boolean | undefined;
  /** The host already wraps the row (a plain `div`); without it the row is an `li` of a `GroupedList`. */
  bare?: boolean | undefined;
  /** 12 px at the sides instead of 16 px, so the row lines up with the rows of a list that open a layer (the settings list). */
  compact?: boolean | undefined;
  className?: string | undefined;
};

/** The look of the row's own box: 44 px high at least, 16 px at the sides (SG-SHAPE-07, SG-TOUCH-01). */
const ROW =
  "relative flex min-h-11 w-full min-w-0 items-center gap-3 px-4 py-3 text-left text-base";
/**
 * The label covers the whole row with its `after`, so the whole row is the target and a tap anywhere turns the switch; the
 * switch comes later in the document and is positioned, so it stays on top and takes its own press.
 */
/** A row with a leading picture is an object row (SG-LIST-03): 8 px sides and gaps, so the label lines up with the hairline. */
const WITH_PICTURE = "gap-2 px-2 py-2.5";
const COMPACT = "px-3";
const LABEL =
  "flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 after:absolute after:inset-0 after:content-['']";
const LINE = "px-4 pb-3 text-sm";

/** The lines under the row: the refusal, linked to the switch, and the reason of the offline state on its own line. */
function RowNotes(props: { errorId: string; error: ReactNode; gate: NetworkGate | undefined }) {
  return (
    <>
      {props.error !== undefined && (
        <p id={props.errorId} role="alert" className={cn(LINE, "m-0 text-destructive")}>
          {props.error}
        </p>
      )}
      {props.gate?.inline ? (
        <NetworkReason id={props.gate.reasonId} className={cn(LINE, "block")} />
      ) : null}
    </>
  );
}

/** The ids the switch is described by: the secondary line, the refusal and the offline reason, in that order. */
const describedBy = (ids: readonly (string | undefined)[]) =>
  ids.filter(Boolean).join(" ") || undefined;

function SwitchRowBase(props: SwitchRowProps & { gate?: NetworkGate | undefined }) {
  const { gate, leading } = props;
  const id = useId();
  const labelId = `${id}-label`;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const frozen = props.busy === true || gate?.offline === true;
  const hasHelp = props.help !== undefined;
  const hasError = props.error !== undefined;
  const Root = props.bare ? "div" : "li";
  return (
    <Root className={cn("relative min-w-0", !props.bare && HAIRLINE, props.className)}>
      <div className={cn(ROW, props.compact && COMPACT, leading !== undefined && WITH_PICTURE)}>
        {leading !== undefined && <span className="flex shrink-0 items-center">{leading}</span>}
        <label htmlFor={id} className={LABEL}>
          <span id={labelId} className="hyphens-auto [overflow-wrap:anywhere]">
            {props.label}
          </span>
          {hasHelp && (
            <span id={helpId} className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
              {props.help}
            </span>
          )}
        </label>
        <Switch
          id={id}
          name={props.name}
          checked={props.checked}
          aria-labelledby={labelId}
          aria-describedby={describedBy([
            hasHelp ? helpId : undefined,
            hasError ? errorId : undefined,
            gate?.describedBy,
          ])}
          aria-disabled={frozen || undefined}
          invalid={hasError}
          onCheckedChange={(next) => {
            if (!frozen) props.onCheckedChange(next);
          }}
        />
      </div>
      <RowNotes errorId={errorId} error={props.error} gate={gate} />
    </Root>
  );
}

/** A row whose switch writes at once: its gate is set here, a plain row subscribes to nothing. */
function NetworkSwitchRow(props: SwitchRowProps) {
  const gate = useNetworkGate(undefined, undefined);
  return <SwitchRowBase {...props} gate={gate} />;
}

/**
 * A setting that takes effect at once (US-QS-32, SG-CTRL-02, SG-CTRL-05): a full-width row with the label at the leading
 * edge, one secondary line under it and the switch at the trailing edge. The row is the target (44 px high at least); the
 * label wraps at 200 % text and the switch keeps its size. It is controlled: a refused save leaves the switch where it was and
 * `error` says why at the row (P-10). The switch is `aria-disabled` while `busy`, so it keeps the focus.
 */
export function SwitchRow(props: SwitchRowProps) {
  return props.needsNetwork ? <NetworkSwitchRow {...props} /> : <SwitchRowBase {...props} />;
}
