import * as React from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";

/** The button attributes a row passes on: its name, its state and the layer it opens (WCAG 2.5.3, 4.1.2). */
type RowButton = Pick<
  React.ComponentProps<"button">,
  | "onClick"
  | "ref"
  | "aria-labelledby"
  | "aria-describedby"
  | "aria-disabled"
  | "aria-expanded"
  | "aria-haspopup"
>;

export type OpenRowProps = RowButton & {
  title: string;
  /** One line of value or help under the title; it wraps and is never cut (SG-TYPE-05). */
  value?: React.ReactNode;
  /** The ids of the title and of the value, for a name that adds a word to the visible text (`aria-labelledby`). */
  titleId?: string;
  valueId?: string;
  className?: string;
};

/**
 * The row of a list that opens a layer, without the address: the name, one line of value or help and a chevron (US-QS-15,
 * US-QS-17, US-QS-32). The whole row is the hit area (44 px and more). `LayerOpenRow` opens the layer of `?sheet=<id>`; a
 * caller with a layer of its own (a pick list in a sheet) passes `onClick`, `aria-expanded` and the name.
 */
export function OpenRow({ title, value, titleId, valueId, className, ...button }: OpenRowProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      {...button}
      className={cn(
        // The ring lies inside the row: a list that scrolls clips a ring outside its rows (DS-37, US-QS-15, issue 2650).
        "h-auto min-h-12 w-full justify-start gap-3 whitespace-normal rounded-lg border border-border px-3 py-2 text-left text-base font-normal focus-visible:ring-inset focus-visible:ring-offset-0",
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        <span id={titleId} className="block font-semibold hyphens-auto [overflow-wrap:anywhere]">
          {title}
        </span>
        {value === undefined ? null : (
          <>
            {/* A space between the two blocks, as in `RowContent`: a check that reads the text by tag name adds none. */}{" "}
            <span
              id={valueId}
              className="block text-sm text-muted-foreground hyphens-auto [overflow-wrap:anywhere]"
            >
              {value}
            </span>
          </>
        )}
      </span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </Button>
  );
}
