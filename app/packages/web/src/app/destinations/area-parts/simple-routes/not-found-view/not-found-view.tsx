import { useEffect } from "react";
import { useNavigate } from "react-router";
import { FileQuestion } from "lucide-react";
import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import { texts } from "@/shared/lib/text-rules/texts";
import { PATHS } from "@/shared/patterns/navigation/navigation/navigation";
import { pageTitle } from "@/shared/patterns/navigation/nav-item";
import { claimTitle } from "@/shared/platform/routing/route-focus/view-start";
import table from "./not-found-view.de.json";

const ui = texts(table);

/**
 * The view of an address that matches no page (US-QS-32, owner answer Q-25, finding F-0058): inside the frame, so both bars
 * stay, with its own mark (not the empty illustration, not the error circle), the title and the one filled action "Zu Heute".
 * Its page title says that the page is missing; the claim keeps the shell from setting the title of "Heute" meanwhile.
 */
export function NotFoundView() {
  const navigate = useNavigate();
  useEffect(() => {
    const title = pageTitle(ui("pageTitle"));
    document.title = title;
    return claimTitle(title);
  }, []);
  return (
    <EmptyState
      level={1}
      icon={FileQuestion}
      title={ui("title")}
      action={{ label: ui("toToday"), onClick: () => void navigate(PATHS.today) }}
    />
  );
}
