import * as React from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button/button";
import { cn } from "@/lib/utils";
import { LayerSheet, useLayer } from "../layer-sheet";

/**
 * The look of a species row that opens its layer (issue 1045): one neutral row for the Pokédex and the comparison by
 * difficulty alike. Green stays for intent, so a long list of rows does not turn green.
 */
export const SPECIES_ENTRY_ROW =
  "h-auto w-full justify-between gap-2 whitespace-normal border-border px-3 py-1.5 text-left text-foreground";

/**
 * A row of a list that opens its layer (US-QS-15, US-QS-17): the name, one line of value or help and a chevron. The whole
 * row is the hit area (44 px and more); the layer it opens is `?sheet=<id>`.
 */
export function LayerOpenRow({
  id,
  title,
  value,
  className,
}: {
  id: string;
  title: string;
  value?: React.ReactNode;
  className?: string;
}) {
  const { open, openLayer } = useLayer(id);
  return (
    <Button
      type="button"
      variant="ghost"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={(event) => openLayer(event.currentTarget)}
      className={cn(
        "h-auto min-h-12 w-full justify-start gap-3 whitespace-normal rounded-lg border border-border px-3 py-2 text-left text-base font-normal",
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        {value === undefined ? null : (
          <span className="block text-sm text-muted-foreground">{value}</span>
        )}
      </span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </Button>
  );
}

/**
 * A row and its layer (US-QS-17): the row sits in the list; the layer opens in the pane of the surrounding `LayerHost`
 * from 1024 px and above the screen below that. A closed layer renders nothing and loads nothing.
 */
export function LayerPart({
  id,
  title,
  value,
  primaryAction,
  children,
}: {
  id: string;
  title: string;
  value?: React.ReactNode;
  primaryAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <LayerOpenRow id={id} title={title} value={value} />
      <LayerSheet id={id} title={title} primaryAction={primaryAction}>
        {children}
      </LayerSheet>
    </>
  );
}
