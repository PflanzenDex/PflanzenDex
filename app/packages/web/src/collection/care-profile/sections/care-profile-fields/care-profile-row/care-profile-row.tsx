import type { ReactNode } from "react";
import { Button } from "@/components/ui/button/button";
import { Quiet } from "../../../../specimens/cards/parts/parts";

/** One field of the care profile: the catalog value, the field and the reset to the catalog (US-BES-09). */
export function Row(props: {
  label: string;
  species: string;
  catalog: string;
  hasOwn: boolean;
  busy: boolean;
  onReset: () => void;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2 border-t border-border py-1">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <Quiet>{`Katalog: ${props.catalog}`}</Quiet>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!props.hasOwn || props.busy}
          aria-label={`Auf Katalog zurücksetzen: ${props.label} (${props.species})`}
          onClick={props.onReset}
        >
          Auf Katalog zurücksetzen
        </Button>
      </div>
      <div className="grid gap-2">{props.children}</div>
    </div>
  );
}
