import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent } from "@/shared/ui/dialog";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./unsaved-input-dialog.de.json";

const t = texts(table);

/**
 * "Eingabe verwerfen?" (US-QS-32, SG-FORM-06, SG-SHEET-05): a close or Back with typed input that is not saved asks first.
 * "Weiter bearbeiten" (and Escape) keeps the form and its input, and it is the default; "Eingabe verwerfen" leaves them. One
 * dialog, two verbs, never "Ja" or "Nein". Used by the plant forms (US-QS-15) and by the layers (`LayerSheet`).
 */
export function UnsavedInputDialog(props: {
  open: boolean;
  onKeep: () => void;
  onDiscard: () => void;
  /** Where the focus goes when the dialog closes; Radix returns it to the element focused before when not given. */
  onCloseAutoFocus?: (event: Event) => void;
}) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={(next) => {
        if (!next) props.onKeep();
      }}
    >
      <DialogContent
        title={t("title")}
        description={t("text")}
        {...(props.onCloseAutoFocus ? { onCloseAutoFocus: props.onCloseAutoFocus } : {})}
      >
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="touch" onClick={props.onKeep}>
            {t("keep")}
          </Button>
          <Button type="button" size="touch" variant="destructive-plain" onClick={props.onDiscard}>
            {t("discard")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
