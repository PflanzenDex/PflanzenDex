import { Link } from "react-router";
import { LAYER_PARAM, Pager } from "@/shared/patterns/responsive/pager/pager";
import { texts } from "@/shared/lib/text-rules/texts";
import { cn } from "@/shared/lib/utils";
import table from "../../flows.de.json";
import { isShownLocked, lockAddress, lockMark, lockLine } from "../model/unlock-texts";
import type { UnlockEntry } from "../model/unlock-api";
import { useUnlocks } from "../model/unlocks/unlocks";

const t = texts(table);

/** Rows per page in the layer until the layout measures its free height (starting value, assumption; issue 1156). */
const PAGE_SIZE = 4;

/**
 * The functions that are not open yet, as rows with the same marking as in the navigation (US-ONB-05): text "Bald" or
 * "Noch gesperrt", then reason and way as a plain fact. A row opens the lock page. Renders nothing while nothing is
 * locked, so an account in style "many" sees exactly what it saw before (FR-ONB-06). Switched-off functions and, in
 * calm mode, the achievement functions never appear (FR-ONB-03, US-ACH-08). With `only` the rows of a destination
 * show the locked parts inside it (AI access, the achievement sections), same marking.
 */
export function LockedRows(props: {
  only?: readonly string[];
  /**
   * Inside its own layer the layer title names the part, so the heading is only for screen readers (US-QS-18, A-05), and
   * the rows page by the free height of the layer instead of scrolling it (US-QS-15, issue 1156).
   */
  inLayer?: boolean;
}) {
  const { only, inLayer } = props;
  const locked = useUnlocks()
    .entries.filter(isShownLocked)
    .filter((e) => !only || only.includes(e.id));
  if (locked.length === 0) return null;
  // Inside a destination (`only`) the rows sit below the heading of their part: one level down, one id per place.
  const Heading = only ? "h3" : "h2";
  const id = only ? `locked-title-${only.join("-")}` : "locked-title";
  return (
    <section
      aria-labelledby={id}
      className={cn("flex flex-col gap-2", inLayer && "min-h-0 flex-1")}
    >
      <Heading
        id={id}
        className={inLayer ? "sr-only" : only ? "text-lg font-semibold" : "text-xl font-semibold"}
      >
        {t("locked.title")}
      </Heading>
      {inLayer ? (
        <Pager
          items={locked}
          pageSize={PAGE_SIZE}
          fit
          param={LAYER_PARAM}
          replace
          label={t("locked.title")}
          getKey={(e) => e.id}
          renderItem={(e) => <LockedRow entry={e} />}
        />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {locked.map((e) => (
            <li key={e.id}>
              <LockedRow entry={e} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** One locked function: its marking, then reason and way; it opens the lock page (US-ONB-05). */
function LockedRow({ entry: e }: { entry: UnlockEntry }) {
  return (
    <Link
      to={lockAddress(e.id)}
      className="flex min-h-[44px] flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-border px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="rounded-control border border-border px-2 text-sm font-semibold">
        {lockMark(e)}
      </span>
      <span>{lockLine(e)}</span>
    </Link>
  );
}
