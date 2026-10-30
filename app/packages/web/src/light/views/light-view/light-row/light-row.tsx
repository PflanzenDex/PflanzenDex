import { Button } from "@/components/ui/button/button";
import { useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";

/**
 * One compact row of a zone or a location (US-QS-19): the name, one line of facts and one "Ändern" that opens the
 * layer of the entry. Deleting is not on the row; it lives in the layer (US-LIC-05, P-10).
 */
export function LightRow(props: { name: string; meta: string; layer: string }) {
  const { openLayer } = useLayer(props.layer);
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card px-3 py-1">
      <div className="min-w-0 flex-1">
        <h3 className="break-words text-base font-semibold">{props.name}</h3>
        <p className="break-words text-sm text-muted-foreground">{props.meta}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-haspopup="dialog"
        aria-label={`${props.name} ändern`}
        onClick={(event) => openLayer(event.currentTarget)}
      >
        Ändern
      </Button>
    </div>
  );
}
