import { PageHeader } from "@/shared/patterns/navigation/page-header/page-header";
import { OPERATOR_HEADING } from "@/shared/patterns/navigation/nav-item";
import { OperatorRouteBody } from "@/account";

/**
 * The route's fallback of "Betreiber" until its chunk is there (issue 2230): the title in the top bar below `md` and in the
 * content from `md`, as the page puts it, then the body of the page's rows.
 */
export function OperatorRouteSkeleton() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <PageHeader fallback title={OPERATOR_HEADING} />
      <OperatorRouteBody />
    </div>
  );
}
