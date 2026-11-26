import { accountKey, useRepeatKey, newRepeatKey } from "@/shared/data";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { X } from "lucide-react";
import { NetworkSlot } from "@/shared/ui/button.network-gate";
import { Button } from "@/shared/ui/button";
import { texts } from "@/shared/lib/text-rules/texts";
import { accountAddress } from "@/shared/patterns/navigation/navigation/navigation";
import { FUNCTION_UNLOCKED, saveHint, type NoteOccasion } from "../hint-api";
import table from "../hint.de.json";

const t = texts(table);
type Token = () => Promise<string | undefined>;

/** The table key of each plant sentence (the keys of a table are camel case, FR-QG-26). */
const PLANT_SENTENCE = {
  first_plant_saved: "firstPlantSaved",
  first_measurement: "firstMeasurement",
} as const;

/**
 * The sentence of a note, one line (SG-COPY-05). The function note names where the function is: its phrase links to
 * "Was die App kann" (`functions` of "Konto"), so the keeper can open it from the note.
 */
function NoteText({ occasion }: { occasion: NoteOccasion }) {
  if (occasion !== FUNCTION_UNLOCKED) return <>{t(PLANT_SENTENCE[occasion])}</>;
  return (
    <>
      {t("functionUnlocked.before")}
      <Link to={accountAddress("functions")} className="underline">
        {t("functionUnlocked.link")}
      </Link>
      {t("functionUnlocked.after")}
    </>
  );
}

/**
 * One calm hint (US-ONB-07): a short note at the place where it helps, no modal, no overlay, no blocking. Showing it is
 * recorded once (it starts the 7 days); "Hinweis schließen" stores the dismissal per account and the note never returns. A failed
 * save keeps the note and says so (P-10). Announced as text for screen readers, reachable by keyboard (NFR-13).
 */
export function HintNote(props: {
  occasion: NoteOccasion;
  api: string;
  token: Token;
  onGone: () => void;
}) {
  const { api, token, occasion } = props;
  const [failed, setFailed] = useState(false);
  const keys = useRepeatKey();
  useEffect(() => {
    void (async () => {
      const t = await token();
      // A per-send key: the view mark is silent and idempotent (DM-ONB-03).
      if (t) await saveHint(api, t, { occasion, state: "shown" }, { key: newRepeatKey() });
    })();
  }, [api, token, occasion]);
  const dismiss = async () => {
    const t = await token();
    const r = t
      ? await keys.run(
          (key) => saveHint(api, t, { occasion, state: "dismissed" }, { key }),
          accountKey(`dismiss:${occasion}`),
        )
      : null;
    if (r?.ok) props.onGone();
    else setFailed(true);
  };
  return (
    <aside
      aria-label={t("note.label")}
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-3 py-2"
    >
      {/* The text asks for 12 rem (flex basis), so at 200 % text the close icon wraps below it instead of squeezing the
          words (SG-TYPE-04); min-w-0 lets it shrink to the row, so a 360 px phone never scrolls sideways. */}
      {/* A hint is secondary content: 14 px (`text-sm`, SG-TYPE-02), so its sentence fits one line beside the close icon. */}
      <p className="m-0 min-w-0 flex-1 basis-48 text-sm">
        <NoteText occasion={occasion} />
      </p>
      <NetworkSlot visible={false}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("note.close")}
          needsNetwork
          onClick={() => void dismiss()}
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </NetworkSlot>
      {failed && (
        <p className="m-0 w-full text-sm" role="alert">
          {t("note.failed")}
        </p>
      )}
    </aside>
  );
}
