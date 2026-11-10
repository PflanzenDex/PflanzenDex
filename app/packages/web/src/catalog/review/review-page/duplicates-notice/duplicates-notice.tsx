import type { ApprovedDuplicate } from "@pflanzendex/core";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../review-page.de.json";

const t = texts(table);

/** How many Latin names the notice names before it says how many it leaves out (starting value, assumption). */
const NOTICE_NAMES = 5;

/**
 * The read-only notice above the review list (US-BES-10): how many Latin names approved species share, the first ones
 * by name, and that they cannot be merged yet. A cut list says how many it leaves out (P-10). It has no action: merging
 * approved species is issue 1583.
 */
export function DuplicatesNotice(props: { duplicates: readonly ApprovedDuplicate[] }) {
  const { duplicates } = props;
  if (duplicates.length === 0) return null;
  const shown = duplicates
    .slice(0, NOTICE_NAMES)
    .map((d) => d.latinName)
    .join(", ");
  const left = duplicates.length - NOTICE_NAMES;
  const names = left > 0 ? `${shown} ${t("duplicates.more", { count: left })}` : shown;
  const lead =
    duplicates.length === 1
      ? t("duplicates.one", { names })
      : t("duplicates.many", { count: duplicates.length, names });
  return (
    <p className="rounded-lg border border-border p-3 text-sm">
      {lead} {t("duplicates.cannotMerge")}
    </p>
  );
}
