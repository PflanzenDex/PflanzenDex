import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button/button";
import { useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";

/** One group of the settings (US-QS-17): its name, its current value and the layer it opens (`?sheet=<id>`). */
export function SettingsRow(props: { id: string; title: string; value: string }) {
  const { open, openLayer } = useLayer(props.id);
  return (
    <Button
      type="button"
      variant="ghost"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={(event) => openLayer(event.currentTarget)}
      className="h-auto min-h-12 w-full justify-start gap-3 whitespace-normal px-3 py-2 text-left text-base font-normal"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{props.title}</span>
        <span className="block text-sm text-muted-foreground [overflow-wrap:anywhere]">
          {props.value}
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </Button>
  );
}
