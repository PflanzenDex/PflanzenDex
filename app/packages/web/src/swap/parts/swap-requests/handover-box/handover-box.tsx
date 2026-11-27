import { useState } from "react";
import { Link } from "react-router";
import type { SwapSide } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { texts } from "@/shared/lib/text-rules/texts";
import { PARAM } from "@/shared/patterns/responsive/layer-sheet/use-layer.history";
import { ARCHIVE_LAYER } from "@/collection";
import table from "../../../swap.de.json";
import { PLANT_TYPE, swapTitle } from "../swap-text";

const t = texts(table);

// The archive of the Sammlung (US-BES-07, Q-85): its layer open on the plants. The view key stays a literal: VIEW_PARAM sits
// in the app layer, which a module may not import (AB-15).
const ARCHIVE_ADDRESS = `/collection?view=plants&${PARAM}=${ARCHIVE_LAYER}`;

/**
 * Before the giver confirms a plant: it goes into the archive once the friend confirmed, or with this confirmation when the
 * friend confirmed already (US-SOZ-11, Q-149).
 */
function archiveSentence(s: SwapSide): string {
  const who = s.otherName ?? "der Freund";
  if (s.confirmedRecipient)
    return s.specimenName
      ? t("handover.archiveWithYou", { name: s.specimenName })
      : t("handover.archiveWithYouUnnamed");
  return s.specimenName
    ? t("handover.archiveBefore", { name: s.specimenName, who })
    : t("handover.archiveBeforeUnnamed", { who });
}

/** After the handover the giver's plant is in the archive, with a row to it, while it is still archived (US-SOZ-11, US-BES-07). */
function ArchiveNote({ s }: { s: SwapSide }) {
  return (
    <div className="grid gap-1">
      <p className="text-sm">
        {s.specimenName
          ? t("handover.archived", { name: s.specimenName })
          : t("handover.archivedUnnamed")}
      </p>
      <Link to={ARCHIVE_ADDRESS}>{t("handover.archiveLink")}</Link>
    </div>
  );
}

/**
 * The handover of an accepted swap (US-SOZ-11): each side confirms once, it counts only when both did. The recipient may
 * name a marker for the new specimen (only needed when the species is in the collection already, DM-BES-03); a refusal is
 * shown by the parent by its error code and the form stays. After my confirmation the card says who is awaited (P-09).
 * The giver of a plant is told before the confirmation that the plant goes into the archive, and after the handover where
 * it is, as long as it is archived (US-SOZ-11, Q-149).
 */
export function HandoverBox(props: {
  s: SwapSide;
  busy: boolean;
  onConfirm: (marker: string | null) => void;
}) {
  const { s } = props;
  const [marker, setMarker] = useState("");
  if (s.status === "handed_over")
    return s.role === "giver" && s.type === PLANT_TYPE && s.specimenArchived ? (
      <ArchiveNote s={s} />
    ) : null;
  if (s.status !== "accepted") return null;
  const recipient = s.role === "recipient";
  const mine = recipient ? s.confirmedRecipient : s.confirmedGiver;
  const title = swapTitle(s);
  if (mine)
    return (
      <p className="text-sm text-muted-foreground">
        {t("handover.waiting", { who: s.otherName ?? "der Freund" })}
      </p>
    );
  return (
    <div className="grid gap-2">
      {!recipient && s.type === PLANT_TYPE && <p className="text-sm">{archiveSentence(s)}</p>}
      {recipient && (
        <label className="grid gap-1 text-sm font-medium">
          {t("handover.marker")}
          <Input value={marker} maxLength={40} onChange={(e) => setMarker(e.target.value)} />
        </label>
      )}
      <div>
        <Button
          type="button"
          size="touch"
          disabled={props.busy}
          aria-label={t(recipient ? "handover.aria.receipt" : "handover.aria.handover", { title })}
          onClick={() => props.onConfirm(recipient && marker.trim() ? marker.trim() : null)}
        >
          {t(recipient ? "handover.button.receipt" : "handover.button.handover")}
        </Button>
      </div>
    </div>
  );
}
