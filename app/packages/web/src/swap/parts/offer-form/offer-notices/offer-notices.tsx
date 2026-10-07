import type { OfferPreview } from "@pflanzendex/core";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { healthText } from "../health-text";

/**
 * What friends will learn and what has to be settled before the offer can be made (US-SOZ-08): the sharing (the offer needs
 * `Share = friends`, with a way to set it), an existing offer, the health details, the dormancy phase, the explicit
 * confirmation for an open treatment, and the plant law notice (FR-SOZ-09: informs, never blocks).
 */
export function OfferNotices(props: {
  preview: OfferPreview;
  confirm: boolean;
  busy: boolean;
  onConfirm: (v: boolean) => void;
  onShare: () => void;
}) {
  const p = props.preview;
  return (
    <div className="flex flex-col gap-2">
      {!p.shared && (
        <div className="rounded-lg border border-warning-border p-3">
          <p>
            Dieses Exemplar ist nicht für Freunde freigegeben. Ein Angebot braucht diese Freigabe.
          </p>
          <Button
            type="button"
            size="touch"
            variant="outline"
            disabled={props.busy}
            onClick={props.onShare}
          >
            Jetzt für Freunde freigeben
          </Button>
        </div>
      )}
      {p.offered && (
        <p className="rounded-lg border border-border p-3">
          Dafür gibt es schon ein offenes Angebot.
        </p>
      )}
      <p className="text-sm">{healthText(p.health)}</p>
      {p.phase === "dormancy" && <p className="text-sm">Zurzeit in der Ruhephase.</p>}
      {p.health.treatmentOpen && (
        <Checkbox checked={props.confirm} onChange={(e) => props.onConfirm(e.target.checked)}>
          Ich bestätige: Es läuft noch eine Behandlung, ich möchte es trotzdem anbieten.
        </Checkbox>
      )}
      <p className="rounded-lg border border-border p-3 text-sm">{p.notice}</p>
    </div>
  );
}
