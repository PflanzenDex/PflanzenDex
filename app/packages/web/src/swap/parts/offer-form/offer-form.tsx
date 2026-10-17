import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button/button";
import { errorText } from "@/lib/error-text";
import { useInvalidate, useRequest, useWriteAction } from "../../../kernel";
import { createOffer, loadPreview, shareSpecimen, type OwnSpecimenRow } from "../../api/offers-api";
import { OfferFields, type OfferFieldValues } from "./offer-fields/offer-fields";
import { OfferNotices } from "./offer-notices/offer-notices";

type Token = () => Promise<string | undefined>;
const EMPTY: OfferFieldValues = {
  specimenId: "",
  type: "cutting",
  mode: "swap",
  wish: "",
  note: "",
};

/** The state of the dialog: the fields, the preview of the chosen specimen and the writes (create, share). */
function useOfferForm(api: string, token: Token, onChanged: () => void) {
  const [fields, setFields] = useState<OfferFieldValues>(EMPTY);
  const [confirm, setConfirm] = useState(false);
  const refreshPreview = useInvalidate(["swap", "preview"]);
  const after = useCallback(() => {
    refreshPreview();
    onChanged();
  }, [refreshPreview, onChanged]);
  const write = useWriteAction(token, after);
  const load = useCallback(
    (t: string) => loadPreview(api, t, fields.specimenId),
    [api, fields.specimenId],
  );
  const preview = useRequest({
    queryKey: ["swap", "preview", fields.specimenId],
    token,
    load,
    enabled: fields.specimenId !== "",
  });
  const p = preview.value;
  const ready = p !== undefined && p.shared && !p.offered && (!p.health.treatmentOpen || confirm);
  const submit = async () => {
    const { wish, note, ...rest } = fields;
    await write.run(
      (t) =>
        createOffer(api, t, {
          ...rest,
          ...(wish.trim() ? { wish: wish.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(confirm ? { confirmTreatment: true } : {}),
        }),
      "Das Angebot ist erstellt. Deine Freunde sehen es in der Tauschbörse.",
    );
    setConfirm(false);
  };
  const share = () =>
    void write.run(
      (t) => shareSpecimen(api, t, fields.specimenId),
      "Freigegeben: Freunde sehen dieses Exemplar ab jetzt.",
    );
  return {
    fields,
    setFields: (v: OfferFieldValues) => {
      if (v.specimenId !== fields.specimenId) setConfirm(false);
      setFields(v);
    },
    confirm,
    setConfirm,
    write,
    preview,
    p,
    ready,
    submit,
    share,
  };
}

/**
 * The dialog "Zum Tausch anbieten" (US-SOZ-08): choose a specimen, type and mode, a wish and a note; before anything is
 * written it shows what friends will learn (health details without agent and notes, the dormancy phase), asks for the
 * sharing when the specimen is private, asks for an explicit confirmation when a treatment is open, and shows the plant
 * law notice (FR-SOZ-09: informs, never blocks).
 */
export function OfferForm(props: {
  api: string;
  token: Token;
  specimens: readonly OwnSpecimenRow[];
  onChanged: () => void;
}) {
  const s = useOfferForm(props.api, props.token, props.onChanged);
  return (
    <section aria-labelledby="offer-form-title" className="flex min-w-0 flex-col gap-3">
      <h2 id="offer-form-title" className="text-xl font-semibold">
        Zum Tausch anbieten
      </h2>
      {s.write.message && (
        <p role="status" className="rounded-lg border border-border p-3">
          {s.write.message}
        </p>
      )}
      {s.write.error && (
        <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">
          {errorText(s.write.error.code)}
        </p>
      )}
      <div className="flex max-w-xl flex-col gap-3">
        <OfferFields specimens={props.specimens} value={s.fields} onChange={s.setFields} />
        {s.fields.specimenId === "" && (
          <p className="text-muted-foreground">
            Wähle ein Exemplar, dann siehst du, was Freunde über es erfahren.
          </p>
        )}
        {s.preview.status === "error" && (
          <p role="alert" className="text-destructive">
            Die Angaben zum Exemplar konnten nicht geladen werden.
          </p>
        )}
        {s.p && (
          <OfferNotices
            preview={s.p}
            confirm={s.confirm}
            busy={s.write.running}
            onConfirm={s.setConfirm}
            onShare={s.share}
          />
        )}
        <div>
          <Button
            type="button"
            size="touch"
            disabled={!s.ready || s.write.running}
            onClick={() => void s.submit()}
          >
            Angebot erstellen
          </Button>
        </div>
      </div>
    </section>
  );
}
