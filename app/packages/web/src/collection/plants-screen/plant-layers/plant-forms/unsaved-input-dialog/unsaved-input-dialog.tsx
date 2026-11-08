import { Button } from "@/shared/ui/button/button";
import { Dialog, DialogContent } from "@/shared/ui/overlays/dialog/dialog";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../address/address.de.json";

const t = texts(table);

/**
 * "Eingabe verwerfen?" (US-QS-15): Back or a cancel with typed input that is not saved asks first. "Weiter bearbeiten"
 * (and Escape) keeps the form and its input; "Verwerfen" leaves it.
 */
export function UnsavedInputDialog(props: {
  open: boolean;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={(next) => {
        if (!next) props.onKeep();
      }}
    >
      <DialogContent title={t("asking.title")} description={t("asking.text")}>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="touch" onClick={props.onKeep}>
            {t("asking.keep")}
          </Button>
          <Button type="button" size="touch" variant="outline" onClick={props.onDiscard}>
            {t("asking.discard")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
