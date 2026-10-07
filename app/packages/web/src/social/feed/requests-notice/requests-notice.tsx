import { useCallback } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { useRequest } from "../../../kernel";
import { loadOpenRequests } from "../../api/feed-api";
import { nameOf } from "../../parts/request-list/request-list";

type Token = () => Promise<string | undefined>;

/**
 * "Du hast N offene Freundschaftsanfragen" (US-SOZ-12): the in-app way to learn that someone asked to be a friend, with the
 * way to answer (P-09). Derived on every visit from the open requests, so it disappears by itself once they are answered and
 * needs no state of its own. Only the display name of the person is named, nothing else (P-05). Delivery by push or mail
 * (E-10, US-MON-01) comes with the reminders of epic MON; until then "open points" are shown where the keeper looks anyway.
 * A failed load stays quiet: the page "Freunde" shows the requests and says if it cannot load them.
 */
export function RequestsNotice(props: { api: string; token: Token }) {
  const { api, token } = props;
  const load = useCallback((t: string) => loadOpenRequests(api, t), [api]);
  const r = useRequest({ queryKey: ["social", "requests-notice"], token, load });
  const incoming = r.value?.incoming ?? [];
  if (incoming.length === 0) return null;
  const names = incoming.map((i) => nameOf(i.otherName)).join(", ");
  return (
    <section
      aria-label="Offene Freundschaftsanfragen"
      className="flex min-w-0 flex-col gap-2 rounded-lg border-2 border-primary p-3"
    >
      <p>
        <strong>
          {incoming.length === 1
            ? "Du hast 1 offene Freundschaftsanfrage"
            : `Du hast ${incoming.length} offene Freundschaftsanfragen`}
          :
        </strong>{" "}
        {names}
      </p>
      <div>
        <Button asChild size="touch">
          <Link to="/friends">Anfragen ansehen</Link>
        </Button>
      </div>
    </section>
  );
}
