import { Select } from "@/shared/ui/fields/select/select";

export type Choice<V extends string> = { value: V; label: string };

/**
 * One choice of a short fixed list as one row (SG-CTRL-04): the visible name beside a native select (the OS picker,
 * ADR 0007), then one line of help. One row, so the layer "Wie nutzt du die App?" fits one screen (US-QS-15, QG-U8);
 * the row wraps at a large text size instead of running past the edge.
 */
export function ChoiceRow<V extends string>(props: {
  name: string;
  label: string;
  help: string;
  options: readonly Choice<V>[];
  value: V;
  onPick: (value: V) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="font-semibold">{props.label}</span>
        <Select
          name={props.name}
          className="w-auto max-w-full"
          value={props.value}
          onChange={(e) => {
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
    </div>
  );
}
