import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button/button";
import { cn } from "@/lib/utils";

/** The query parameter of the chosen group, e.g. `?group=location&part=Regal` (US-QS-19). */
export const PART_PARAM = "part";

export type GroupChoice = { key: string; label: string; count: number };

/** The chosen group of the address: the one named by `part=`, else the first (US-QS-19). */
export function usePart(choices: readonly GroupChoice[]): GroupChoice | undefined {
  const [params] = useSearchParams();
  const wanted = params.get(PART_PARAM);
  return choices.find((c) => c.key === wanted) ?? choices[0];
}

/**
 * A row of group choices with their counts (US-QS-19): toggle buttons in a named group, the chosen one marked by
 * a check mark besides colour. The choice is in the address (`part=`), so back, forward and a copied link lead to the
 * same group; choosing starts at page 1. A row longer than the screen scrolls sideways inside itself only.
 */
export function GroupChoices({
  label,
  choices,
}: {
  label: string;
  choices: readonly GroupChoice[];
}) {
  const [params, setParams] = useSearchParams();
  const chosen = usePart(choices);
  const choose = (key: string) => {
    const next = new URLSearchParams(params);
    next.set(PART_PARAM, key);
    next.delete("page");
    setParams(next, { state: { keepFocus: true } });
  };
  if (choices.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={label}
      className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1 md:flex-wrap md:overflow-visible"
    >
      {choices.map((c) => {
        const selected = c.key === chosen?.key;
        return (
          <Button
            key={c.key}
            type="button"
            variant={selected ? "secondary" : "outline"}
            size="sm"
            aria-pressed={selected}
            onClick={() => choose(c.key)}
            className={cn("shrink-0 whitespace-nowrap", selected && "font-semibold")}
          >
            {selected ? <span aria-hidden="true">✓</span> : null}
            {c.label} <span className="tabular-nums">({c.count})</span>
          </Button>
        );
      })}
    </div>
  );
}
