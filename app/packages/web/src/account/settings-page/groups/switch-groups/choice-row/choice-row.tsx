import { Select } from "@/shared/ui/select";
import { NetworkReason, useNetworkGate, type NetworkGate } from "@/shared/ui/button.network-gate";

export type Choice<V extends string> = { value: V; label: string };

type ChoiceRowProps<V extends string> = {
  name: string;
  label: string;
  help: string;
  options: readonly Choice<V>[];
  value: V;
  onPick: (value: V) => void;
  /**
   * The choice writes at once (US-QS-30): offline it keeps its value, is shown inactive, and the reason stands below the
   * help line (a row stands alone, so it has its own line).
   */
  needsNetwork?: boolean;
};

/**
 * One choice of a short fixed list as one row (SG-CTRL-04): the visible name beside a native select (the OS picker,
 * ADR 0007), then one line of help. One row, so the layer "Wie nutzt du die App?" fits one screen (US-QS-15, QG-U8);
 * the row wraps at a large text size instead of running past the edge.
 */
function ChoiceRowBase<V extends string>(props: ChoiceRowProps<V> & { gate?: NetworkGate }) {
  const { gate } = props;
  const offline = gate?.offline === true;
  return (
    <div className="flex flex-col gap-0.5">
      <label className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="font-semibold">{props.label}</span>
        <Select
          name={props.name}
          className="w-auto max-w-full aria-disabled:opacity-50"
          value={props.value}
          aria-disabled={offline || undefined}
          aria-describedby={gate?.describedBy}
          onChange={(e) => {
            if (offline) return;
            const picked = props.options.find((o) => o.value === e.target.value);
            if (picked && picked.value !== props.value) props.onPick(picked.value);
          }}
        >
          {props.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </label>
      <p className="m-0 text-sm text-muted-foreground">{props.help}</p>
      {gate?.inline ? <NetworkReason id={gate.reasonId} /> : null}
    </div>
  );
}

/** A choice that writes at once: its gate is set here, a plain choice row subscribes to nothing. */
function NetworkChoiceRow<V extends string>(props: ChoiceRowProps<V>) {
  const gate = useNetworkGate(undefined, undefined);
  return <ChoiceRowBase {...props} gate={gate} />;
}

export function ChoiceRow<V extends string>(props: ChoiceRowProps<V>) {
  return props.needsNetwork ? <NetworkChoiceRow {...props} /> : <ChoiceRowBase {...props} />;
}
