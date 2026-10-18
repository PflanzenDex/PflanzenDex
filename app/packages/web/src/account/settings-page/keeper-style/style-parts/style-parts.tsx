import { useRef, useState } from "react";
import { Button } from "@/components/ui/button/button";
import { Select } from "@/components/ui/fields/select/select";
import { errorText } from "@/lib/error-text";
import { SIGN_IN, type ApiError } from "../../../../kernel";
import { saveKeeperStyle, type KeeperStyle, type KeeperStyleState } from "../keeper-style-api";

type Token = () => Promise<string | undefined>;

const ALERT =
  "rounded-lg border border-destructive p-3 text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** The two answers; no level, rank or title (FR-ONB-08). */
export const KEEPER_STYLE_CHOICES: readonly {
  readonly style: KeeperStyle;
  readonly label: string;
  readonly hint: string;
}[] = [
  {
    style: "few",
    label: "Ich pflege ein paar Pflanzen",
    hint: "Neue Funktionen zeigt die App dir nach und nach.",
  },
  {
    style: "many",
    label: "Ich verwalte viel, zeig mir alles",
    hint: "Alles ist sofort offen, ohne Hinweise.",
  },
];

/** Saves one choice at a time; a refusal stays visible and the stored style stays (P-10). */
export function useSaveStyle(
  props: { api: string; token: Token },
  onSaved: (s: KeeperStyleState) => void,
) {
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const save = async (style: KeeperStyle) => {
    if (busy.current) return false;
    busy.current = true;
    setSaving(true);
    const t = await props.token();
    const r = t
      ? await saveKeeperStyle(props.api, t, style)
      : { ok: false as const, error: SIGN_IN };
    busy.current = false;
    setSaving(false);
    setError(r.ok ? null : r.error);
    if (r.ok) onSaved(r.value);
    return r.ok;
  };
  return { save, saving, error };
}

export function Refusal(props: { error: ApiError | null }) {
  if (!props.error) return null;
  return (
    <p role="alert" className={`${ALERT} mt-2`}>
      {props.error.code === "network.not_reachable"
        ? props.error.text
        : errorText(props.error.code)}
    </p>
  );
}

/** The profile choice: a select with the two answers; the hint under it names what the current answer means. */
export function StyleSelect(props: {
  value: KeeperStyle;
  disabled: boolean;
  onPick: (s: KeeperStyle) => void;
}) {
  const current = KEEPER_STYLE_CHOICES.find((c) => c.style === props.value);
  return (
    <>
      <Select
        aria-label="Wie nutzt du die App?"
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onPick(e.target.value === "many" ? "many" : "few")}
      >
        {KEEPER_STYLE_CHOICES.map((c) => (
          <option key={c.style} value={c.style}>
            {c.label}
          </option>
        ))}
      </Select>
      <p className="mt-1 text-sm text-muted-foreground">{current?.hint}</p>
    </>
  );
}

/** The question after the first plant: one button per answer, equally weighted. */
export function StyleButtons(props: { disabled: boolean; onPick: (s: KeeperStyle) => void }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      {KEEPER_STYLE_CHOICES.map((c) => (
        <Button
          key={c.style}
          type="button"
          variant="secondary"
          disabled={props.disabled}
          onClick={() => props.onPick(c.style)}
        >
          {c.label}
        </Button>
      ))}
    </div>
  );
}
