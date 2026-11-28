import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";

/**
 * One group of the settings (US-QS-17): its name, its current value and the layer it opens (`?sheet=<id>`). 4 px above and below
 * the two lines and at least 48 px high, so the eight rows of the list fit between the bars at 360 x 640 (DS-58, US-QS-15).
 */
export function SettingsRow(props: { id: string; title: string; value: ReactNode }) {
  const { open, openLayer } = useLayer(props.id);
  return (
    <Button
      type="button"
      variant="ghost"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={(event) => openLayer(event.currentTarget)}
      className="h-auto min-h-12 w-full justify-start gap-3 whitespace-normal px-3 py-1 text-left text-base font-normal"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-semibold hyphens-auto [overflow-wrap:anywhere]">
          {props.title}
        </span>
        <span className="block text-sm text-muted-foreground hyphens-auto [overflow-wrap:anywhere]">
          {props.value}
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </Button>
  );
}
