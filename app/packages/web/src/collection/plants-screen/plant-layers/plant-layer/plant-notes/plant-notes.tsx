import { useState } from "react";
import type { SpecimenCard } from "@pflanzendex/core";
import { useRequest } from "@/shared/data";
import { refusalText } from "@/shared/lib/error-text";
import { cn } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import { Button } from "@/shared/ui/button/button";
import type { PhotoAccess } from "@/shared/platform/browser/use-stored-photo";
import { Warning } from "../../../../specimens/cards/parts/parts";
import { loadSpecimenNotes, type SpecimenNotes } from "../../../../specimens/model/specimens-api";
import table from "./plant-notes.de.json";

const t = texts(table);

/**
 * A note is cut to three lines, and a button reads all of it, when it is longer than this or has more lines (US-QS-15:
 * the layer fits one screen). A presentation rule for the screen, not a limit of the data (starting value, assumption).
 */
const CUT_CHARACTERS = 160;
const CUT_LINES = 3;
const isLong = (notes: string) =>
  notes.length > CUT_CHARACTERS || notes.split("\n").length > CUT_LINES;

/** The text of a note, cut until the keeper asks for all of it; the edit button sits beside it (US-BES-18). */
function NoteText(props: { notes: string; name: string; onEdit?: (() => void) | undefined }) {
  const [all, setAll] = useState(false);
  const long = isLong(props.notes);
  const cut = long && !all;
  return (
    <div className="grid justify-items-start gap-1.5">
      <p className={cn("max-w-full whitespace-pre-line break-words", cut && "line-clamp-3")}>
        {props.notes}
      </p>
      {long ? (
        <Button type="button" variant="ghost" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? t("section.less") : t("section.more")}
        </Button>
      ) : null}
      {props.onEdit ? (
        <Button
          type="button"
          variant="outline"
          aria-label={t("section.editLabel", { name: props.name })}
          onClick={props.onEdit}
        >
          {t("section.edit")}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The private notes of a plant on its overview (US-BES-18). The notes come from the keeper's own detail, read when the
 * overview opens; without a note the section says what to do (P-09), and a failed read says so with a retry (P-10).
 * Writing happens in the page's form: `onEdit` leaves the layer and opens it with the notes shown here.
 */
export function PlantNotes(props: {
  card: SpecimenCard;
  access: PhotoAccess;
  /** Opens the form to write or clear the notes; without it the section only shows them. */
  onEdit?: ((notes: string | null) => void) | undefined;
}) {
  const { card, access, onEdit } = props;
  const request = useRequest<SpecimenNotes>({
    queryKey: ["specimen-notes", card.id],
    token: access.token,
    load: (token) => loadSpecimenNotes(access.api, token, card.id),
    fresh: true,
  });
  const notes = request.status === "ready" ? (request.value?.notes ?? null) : null;
  return (
    <section aria-labelledby="plant-notes-title" className="grid gap-1.5 text-sm">
      <h3 id="plant-notes-title" className="font-medium">
        {t("section.title")}
      </h3>
      {request.status === "pending" ? (
        <p className="text-muted-foreground">{t("section.loading")}</p>
      ) : null}
      {request.status === "error" && request.error ? (
        <Warning>
          <p>{t("section.failed")}</p>
          <p>{refusalText(request.error)}</p>
          <Button type="button" variant="outline" onClick={request.retry}>
            {t("section.retry")}
          </Button>
        </Warning>
      ) : null}
      {request.status === "ready" && notes !== null ? (
        <NoteText
          notes={notes}
          name={card.name}
          onEdit={onEdit ? () => onEdit(notes) : undefined}
        />
      ) : null}
      {request.status === "ready" && notes === null ? (
        <div className="grid justify-items-start gap-1.5">
          <p className="text-muted-foreground">{t("section.empty")}</p>
          {onEdit ? (
            <Button
              type="button"
              variant="outline"
              aria-label={t("section.writeLabel", { name: card.name })}
              onClick={() => onEdit(null)}
            >
              {t("section.write")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
