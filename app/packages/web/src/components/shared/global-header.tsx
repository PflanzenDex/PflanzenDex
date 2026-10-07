import { Link } from "react-router";

/**
 * Top bar below `md` (US-QS-07, US-QS-14, DS-25): only the brand, which links home. The destinations are in the
 * bottom bar there; from `md` the rail or the sidebar carries the brand and the destinations, so the header is hidden.
 */
export function GlobalHeader() {
  return (
    <header className="sticky top-0 z-40 flex items-center gap-4 border-b border-border bg-card px-4 pt-[env(safe-area-inset-top)] md:hidden">
      <Link
        to="/"
        className="flex min-h-[44px] items-center text-lg font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        PflanzenDex
      </Link>
    </header>
  );
}
