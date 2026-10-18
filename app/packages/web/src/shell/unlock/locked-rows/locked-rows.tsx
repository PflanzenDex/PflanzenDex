import { Link } from "react-router";
import { isShownLocked, lockAddress, lockMark, lockLine } from "../model/unlock-texts";
import { useUnlocks } from "../model/unlocks/unlocks";

/**
 * The functions that are not open yet, as rows with the same marking as in the navigation (US-ONB-05): text "Bald" or
 * "Noch gesperrt", then reason and way as a plain fact. A row opens the lock page. Renders nothing while nothing is
 * locked, so an account in style "many" sees exactly what it saw before (FR-ONB-06). Switched-off functions and, in
 * calm mode, the achievement functions never appear (FR-ONB-03, US-ACH-08). With `only` the rows of a destination
 * show the locked parts inside it (wishlist and equipment mode, AI access, the achievement sections), same marking.
 */
export function LockedRows(props: { only?: readonly string[] }) {
  const { only } = props;
  const locked = useUnlocks()
    .entries.filter(isShownLocked)
    .filter((e) => !only || only.includes(e.id));
  if (locked.length === 0) return null;
  // Inside a destination (`only`) the rows sit below the heading of their part: one level down, one id per place.
  const Heading = only ? "h3" : "h2";
  const id = only ? `locked-title-${only.join("-")}` : "locked-title";
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <Heading id={id} className={only ? "text-lg font-semibold" : "text-xl font-semibold"}>
        Noch nicht geöffnet
      </Heading>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {locked.map((e) => (
          <li key={e.id}>
            <Link
              to={lockAddress(e.id)}
              className="flex min-h-[44px] flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-border px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="rounded-control border border-border px-2 text-sm font-semibold">
                {lockMark(e)}
              </span>
              <span>{lockLine(e)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
