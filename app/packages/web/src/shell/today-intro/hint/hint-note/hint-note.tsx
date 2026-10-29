import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button/button";
import { saveHint } from "../hint-api";
import { HINT_TEXTS } from "../hint-texts";

type Token = () => Promise<string | undefined>;

/**
 * One calm hint (US-ONB-07): a short note at the place where it helps, no modal, no overlay, no blocking. Showing it is
 * recorded once (it starts the 7 days); "Okay" stores the dismissal per account and the note never returns. A failed
 * save keeps the note and says so (P-10). Announced as text for screen readers, reachable by keyboard (NFR-13).
 */
export function HintNote(props: {
  occasion: keyof typeof HINT_TEXTS;
  api: string;
  token: Token;
  onGone: () => void;
}) {
  const { api, token, occasion } = props;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    void (async () => {
      const t = await token();
      if (t) await saveHint(api, t, occasion, "shown");
    })();
  }, [api, token, occasion]);
  const dismiss = async () => {
    const t = await token();
    const r = t ? await saveHint(api, t, occasion, "dismissed") : null;
    if (r?.ok) props.onGone();
    else setFailed(true);
  };
  return (
    <aside
      aria-label="Hinweis"
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-3 py-2"
    >
      <p className="m-0 min-w-0 flex-1">{HINT_TEXTS[occasion]}</p>
      <Button type="button" variant="secondary" onClick={() => void dismiss()}>
        Okay
      </Button>
      {failed && (
        <p className="m-0 w-full text-sm" role="alert">
          Das ließ sich gerade nicht speichern. Der Hinweis bleibt noch stehen; versuche es gleich
          noch einmal.
        </p>
      )}
    </aside>
  );
}
