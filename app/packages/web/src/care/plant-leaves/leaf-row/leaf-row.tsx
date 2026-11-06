import { useState } from "react";
import type { LeafRow as Leaf } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button/button";
import { texts } from "@/shared/lib/text-rules/texts";
import { dateText } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { CARD_CLASSES } from "../../shared/notices/notices";
import table from "../plant-leaves.de.json";

const t = texts(table);

const mm = (value: number | null): string => (value === null ? t("unknown") : t("size", { value }));

/** One leaf of the list: its date, sizes and note, and "Entfernen", which asks first (P-10). */
export function LeafRow(props: { row: Leaf; busy: boolean; onRemove: (row: Leaf) => void }) {
  const { row } = props;
  const [asking, setAsking] = useState(false);
  const date = dateText(row.date);
  return (
    <div className={cn(CARD_CLASSES, "grid gap-2 text-sm")}>
      <p className="font-semibold">{date}</p>
      <p>{t("sizes", { length: mm(row.lengthMm), width: mm(row.widthMm) })}</p>
      {row.note ? <p className="text-muted-foreground">{row.note}</p> : null}
      {asking ? (
        <div className="grid gap-2">
          <p>{t("removeAsk")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              size="touch"
              disabled={props.busy}
              aria-label={t("removeConfirmLabel", { date })}
              onClick={() => props.onRemove(row)}
            >
              {t("removeConfirm")}
            </Button>
            <Button type="button" variant="outline" size="touch" onClick={() => setAsking(false)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button
            type="button"
            variant="outline"
            size="touch"
            disabled={props.busy}
            aria-label={t("removeLabel", { date })}
            onClick={() => setAsking(true)}
          >
            {t("remove")}
          </Button>
        </div>
      )}
    </div>
  );
}
