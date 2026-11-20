import { PageHeader } from "@/shared/patterns/navigation/page-header/page-header";
import { texts } from "@/shared/lib/text-rules/texts";
import type { DiscoverView } from "./discover-view";
import { DiscoverBody } from "./discover-body/discover-body";
import table from "./discover-area.de.json";

const t = texts(table);

/**
 * The route's fallback of "Entdecken" until its chunk is there (US-QS-14, issue 1697): the title stands at once as the
 * one h1 (its focus waits for the page's own heading, RouteFocus), the switch and the mode's body wait for the delay. The
 * body is `DiscoverBody`, the one the start frame draws too (issue 2243).
 */
export function DiscoverRouteSkeleton({ view }: { view: DiscoverView }) {
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-180 flex-col gap-4">
      {/* The title is the page's header: in the top bar below md, where the page puts it (issue 2230). */}
      <PageHeader fallback title={t("page.title")} />
      <DiscoverBody view={view} />
    </div>
  );
}
