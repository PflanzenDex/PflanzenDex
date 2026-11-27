import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

export type TableProps = React.TableHTMLAttributes<HTMLTableElement> & {
  /** Classes for the scroll container around the table. */
  containerClassName?: string;
  /** Accessible name of the scroll region (German, supplied by the caller; DS-37). */
  containerLabel?: string;
};

/**
 * Semantic table (US-QS-07, DS-24, DS-37) that keeps its header row and its first column while it scrolls (US-QS-15, DS-58,
 * SG-LIST-01). The scroll container is the marked scroll region of its frame (`data-scroll-region`, with
 * `data-scroll-x="table"` for the sideways scroll, DS-61, DS-63): it takes the height that is left in the frame
 * (`min-h-24 flex-1`, so the frame must be a column of a given height, as for `ScrollRegion`), scrolls down and sideways
 * inside itself (`overflow-auto`, `overscroll-contain`), and is a named tab stop, so the keyboard scrolls it. The page never
 * scrolls. Below 768 px the region keeps the room of the bottom bar as scroll padding (`--bar-clearance`, SG-LIST-02; from
 * `md` there is none, DS-12), and at the top the height of the header row (`scroll-pt-11`, WCAG 2.4.11). `isolate` keeps
 * the layers of the sticky cells inside the region. The lines of the cells are borders of the cells (`border-separate`),
 * because a line of a row does not stay with a sticky cell. Below `md` modules render cards instead (ResponsiveTable).
 */
const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, containerClassName, containerLabel = "Tabelle", ...props }, ref) => (
    <div
      role="region"
      aria-label={containerLabel}
      data-scroll-region=""
      data-scroll-x="table"
      tabIndex={0}
      className={cn(
        "isolate min-h-24 w-full min-w-0 flex-1 scroll-pt-11 overflow-auto overscroll-contain rounded-card border border-border bg-card text-card-foreground scroll-pb-(--bar-clearance) md:scroll-pb-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        containerClassName,
      )}
    >
      <table
        ref={ref}
        className={cn("w-full caption-bottom border-separate border-spacing-0 text-sm", className)}
        {...props}
      />
    </div>
  ),
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => <thead ref={ref} className={className} {...props} />);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("[&_tr:last-child>*]:border-b-0", className)} {...props} />
));
TableBody.displayName = "TableBody";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => <tr ref={ref} className={className} {...props} />,
);
TableRow.displayName = "TableRow";

/**
 * The layers of the cells that stay (US-QS-15, SG-LIST-01): the cells of the body scroll under the first column (`z-10`), the
 * first column scrolls under the header row (`z-20`) and everything scrolls under the corner (`z-30`). A cell that stays is
 * opaque (`bg-card`, the surface of the region) and has a line on the side where the cells scroll under it.
 */
const STICKY_FIRST =
  "first:sticky first:left-0 first:z-10 first:border-r first:border-border first:bg-card";

/**
 * The two looks of a header cell (US-QS-15, SG-LIST-01, DS-34). A column header sticks to the top of the region, and the first
 * one, the corner, to the left as well. A row header is the first cell of a row of the body: it sticks to the left and looks
 * like the cells of its row, not like a header.
 */
const headVariants = cva("border-b border-border px-3 text-left align-middle font-semibold", {
  variants: {
    kind: {
      column:
        "sticky top-0 z-20 h-11 bg-card text-xs text-muted-foreground first:left-0 first:z-30 first:border-r",
      row: `py-3 text-sm text-foreground ${STICKY_FIRST}`,
    },
  },
  defaultVariants: { kind: "column" },
});

/** Header cell; `scope="col"` (a column header) unless the caller sets another scope, and `scope="row"` makes it a row header. */
const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, scope = "col", ...props }, ref) => (
  <th
    ref={ref}
    scope={scope}
    className={cn(headVariants({ kind: scope === "row" ? "row" : "column" }), className)}
    {...props}
  />
));
TableHead.displayName = "TableHead";

/** Cell; the first cell of a row sticks to the left of the region (US-QS-15), a row header or a plain cell. */
const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn("border-b border-border px-3 py-3 align-middle", STICKY_FIRST, className)}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption ref={ref} className={cn("mt-3 text-sm text-muted-foreground", className)} {...props} />
));
TableCaption.displayName = "TableCaption";

export { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow };
