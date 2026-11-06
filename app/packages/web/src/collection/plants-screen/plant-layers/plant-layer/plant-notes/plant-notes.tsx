import { useEffect, useRef, useState } from "react";
import type { SpecimenCard } from "@pflanzendex/core";
import { useRequest, type ApiError } from "@/shared/data";
import { refusalText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import { LayerSheet, useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { restoreFocus } from "@/shared/patterns/responsive/layer-sheet/use-layer";
import { Button } from "@/shared/ui/button/button";
import type { PhotoAccess } from "@/shared/platform/browser/use-stored-photo";
import { Quiet, Warning } from "../../../../specimens/cards/parts/parts";
import { notesKey, useNotes } from "../../../../specimens/hooks/use-notes";
import { loadSpecimenNotes, type SpecimenNotes } from "../../../../specimens/model/specimens-api";
import { NOTES_FORM, NotesForm } from "./notes-form/notes-form";
import table from "./plant-notes.de.json";

const t = texts(table);

/** The layer of the private notes of one plant (US-BES-18, US-QS-23). */
export const notesLayerId = (specimenId: string): string => `notes-${specimenId}`;

/**
 * The button "Notizen" of the overview. It has an id, so the focus finds it again when the layer above it closes and the
 * plant layer mounts on Back (US-QS-15, issue 1363).
 */
export function NotesButton(props: { card: SpecimenCard }) {
  const { openLayer, open } = useLayer(notesLayerId(props.card.id));
  return (
    <Button
      id={`${notesLayerId(props.card.id)}-opener`}
      type="button"
      variant="outline"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={t("open.label", { name: props.card.name })}
      onClick={(event) => openLayer(event.currentTarget)}
    >
      {t("open.text")}
    </Button>
  );
}

/** Reading mode: `edit` shows the form; `returned` is reading after the form closed, so the focus goes back to the action. */
type Mode = "read" | "edit" | "returned";

/** The filled action while reading; it takes the focus again when the form closed, because the form had it (US-QS-15). */
function WriteAction(props: { written: boolean; returned: boolean; onEdit: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  const { returned } = props;
  useEffect(() => {
    if (returned) button.current?.focus();
  }, [returned]);
  return (
    <Button ref={button} type="button" size="touch" className="w-full" onClick={props.onEdit}>
      {props.written ? t("layer.edit") : t("layer.write")}
    </Button>
  );
}

/** What the layer shows while reading: the whole note, which may scroll inside the layer (US-QS-15), or what to do (P-09). */
function NotesText(props: { notes: string | null }) {
  if (props.notes === null) return <p className="text-muted-foreground">{t("layer.empty")}</p>;
  return <p className="max-w-full whitespace-pre-line break-words">{props.notes}</p>;
}

/** A read that failed says so and offers a retry (P-10). */
function NotesFailed(props: { error: ApiError; onRetry: () => void }) {
  return (
    <Warning>
      <p>{t("layer.failed")}</p>
      <p>{refusalText(props.error)}</p>
      <Button type="button" variant="outline" onClick={props.onRetry}>
        {t("layer.retry")}
      </Button>
    </Warning>
  );
}

/**
 * The private notes of a plant as their own layer (US-BES-18): the overview stays on one screen (US-QS-15, US-QS-23) and
 * the notes are read only while this layer is open. Writing happens here too, so saving leaves the keeper in the layer
 * with the saved text and what changed (P-09), and closing goes back to the plant.
 */
export function NotesLayer(props: { card: SpecimenCard; access: PhotoAccess }) {
  const { card, access } = props;
  const [mode, setMode] = useState<Mode>("read");
  const { message, saving, send, setMessage } = useNotes(access, card);
  const request = useRequest<SpecimenNotes>({
    queryKey: notesKey(card.id),
    token: access.token,
    load: (token) => loadSpecimenNotes(access.api, token, card.id),
    fresh: true,
  });
  // The page drops this layer with the address, before the sheet sees itself close: the opener is kept here, so the plant
  // layer that mounts on Back gives the focus back to "Notizen" (US-QS-15, issue 1363).
  useEffect(() => restoreFocus, []);
  const ready = request.status === "ready";
  const notes = ready ? (request.value?.notes ?? null) : null;
  const action =
    mode === "edit" ? (
      <Button type="submit" form={NOTES_FORM} size="touch" className="w-full" pending={saving}>
        {t("form.submit")}
      </Button>
    ) : ready ? (
      <WriteAction
        written={notes !== null}
        returned={mode === "returned"}
        onEdit={() => {
          setMessage(null);
          setMode("edit");
        }}
      />
    ) : undefined;
  return (
    <LayerSheet id={notesLayerId(card.id)} title={t("layer.title")} primaryAction={action}>
      <div className="grid gap-3 text-sm">
        <Quiet>{t("layer.hint", { name: card.name })}</Quiet>
        {request.status === "pending" ? (
          <p role="status" className="text-muted-foreground">
            {t("layer.loading")}
          </p>
        ) : null}
        {request.status === "error" && request.error ? (
          <NotesFailed error={request.error} onRetry={request.retry} />
        ) : null}
        {ready && mode === "edit" ? (
          <NotesForm
            notes={notes}
            send={send}
            onSaved={() => setMode("returned")}
            onCancel={() => setMode("returned")}
          />
        ) : null}
        {ready && mode !== "edit" ? <NotesText notes={notes} /> : null}
        {message !== null ? <p role="status">{message}</p> : null}
      </div>
    </LayerSheet>
  );
}
