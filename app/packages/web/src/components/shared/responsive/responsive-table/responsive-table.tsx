import * as React from "react";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/display/table/table";
import { useIsMd } from "@/lib/use-breakpoint";

export type ResponsiveColumn<Row> = {
  key: string;
  /** Column header in the table and the label in the card (German, supplied by the caller). */
  header: string;
  cell: (row: Row) => React.ReactNode;
};

export type ResponsiveTableProps<Row> = {
  /** Accessible name of the table and of the card list. */
  caption: string;
  /** The single column definition both views render from (DS-24). */
  columns: ResponsiveColumn<Row>[];
  rows: Row[];
  getRowKey: (row: Row) => string;
  /** The row's main action (a link or button); the label heads the table column. */
  rowAction?: { label: string; render: (row: Row) => React.ReactNode };
};

/** List of rows (US-QS-07, DS-24): card stack below `md`, real `Table` from `md`, one column definition. */
export function ResponsiveTable<Row>({
  caption,
  columns,
  rows,
  getRowKey,
  rowAction,
}: ResponsiveTableProps<Row>) {
  const isMd = useIsMd();

  if (isMd) {
    return (
      <Table containerLabel={caption}>
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.key}>{c.header}</TableHead>
            ))}
            {rowAction ? <TableHead>{rowAction.label}</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={getRowKey(row)}>
              {columns.map((c) => (
                <TableCell key={c.key}>{c.cell(row)}</TableCell>
              ))}
              {rowAction ? <TableCell>{rowAction.render(row)}</TableCell> : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <ul aria-label={caption} className="flex min-w-0 flex-col gap-3">
      {rows.map((row) => (
        <li
          key={getRowKey(row)}
          className="min-w-0 break-words rounded-card bg-card p-4 text-card-foreground shadow-elevation-1"
        >
          <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
            {columns.map((c) => (
              <React.Fragment key={c.key}>
                <dt className="text-muted-foreground">{c.header}</dt>
                <dd className="min-w-0">{c.cell(row)}</dd>
              </React.Fragment>
            ))}
          </dl>
          {rowAction ? (
            <div className="mt-3 flex min-h-[44px] items-center">{rowAction.render(row)}</div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
