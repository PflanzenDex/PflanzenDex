import { Link } from "react-router";
import { isShownLocked, lockAddress, lockMark, lockLine } from "../model/unlock-texts";
import { useUnlocks } from "../model/unlocks/unlocks";

/**
 * The functions that are not open yet, as rows with the same marking as in the navigation (US-ONB-05): text "Bald" or
 * "Noch gesperrt", then reason and way as a plain fact. A row opens the lock page. Renders nothing while nothing is
 * locked, so an account in style "many" sees exactly what it saw before (FR-ONB-06). Switched-off functions and, in
 * calm mode, the achievement functions never appear (FR-ONB-03, US-ACH-08).
 */
export function LockedRows() {
  const locked = useUnlocks().entries.filter(isShownLocked);
  if (locked.length === 0) return null;
  return (
    <section aria-labelledby="locked-title" className="flex flex-col gap-2">
      <h2 id="locked-title" className="text-xl font-semibold">
        Noch nicht geöffnet
      </h2>
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
