import * as React from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { LayerSheet, useLayer } from "../layer-sheet";

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
        // The ring lies inside the row: a list that scrolls clips a ring outside its rows (DS-37, US-QS-15, issue 2650).
        "h-auto min-h-12 w-full justify-start gap-3 whitespace-normal rounded-lg border border-border px-3 py-2 text-left text-base font-normal focus-visible:ring-inset focus-visible:ring-offset-0",
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block font-semibold hyphens-auto [overflow-wrap:anywhere]">{title}</span>
        {value === undefined ? null : (
          <span className="block text-sm text-muted-foreground hyphens-auto [overflow-wrap:anywhere]">
            {value}
          </span>
        )}
      </span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </Button>
  );
}

/**
 * A row and its layer (US-QS-17): the row sits in the list; the layer opens in the pane of the surrounding `LayerHost`
 * from 1024 px and above the screen below that. A closed layer renders nothing and loads nothing. `opener` replaces the
 * row with the caller's own control that opens the layer (it calls `openLayer` of `useLayer(id)`), for a control whose
 * look is not a row (SG-BTN-03).
 */
export function LayerPart({
  id,
  title,
  value,
  opener,
  primaryAction,
  children,
}: {
  id: string;
  title: string;
  value?: React.ReactNode;
  opener?: React.ReactNode;
  primaryAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      {opener ?? <LayerOpenRow id={id} title={title} value={value} />}
      <LayerSheet id={id} title={title} primaryAction={primaryAction}>
        {children}
      </LayerSheet>
    </>
  );
}
