import type { CollectorCard as Card } from "@pflanzendex/core";
import { useEffect, useState } from "react";
import { LayerSheet, useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { cardName } from "../collector-card/card-name";
import { CollectorCards } from "../collector-cards/collector-cards";

/**
 * The layer of the collector cards (US-POK-01, US-QS-15, owner decision d-163): the sheet "Sammlerkarten" with the card row.
 * "Mehr" on a card does not open a second sheet (SG-SHEET-03); the same sheet shows the details of that card, titled with its
 * name, until "Zurück zu den Karten". The sheet opens at half height at least, so it keeps its height from the cards to the
 * details. Closing the layer, by Escape, "Schließen" or Back, closes it whole: the next opening shows the cards again.
 */
export function CollectorCardsLayer(props: {
  id: string;
  title: string;
  api: string;
  token: () => Promise<string | undefined>;
}) {
  const [detail, setDetail] = useState<Card | null>(null);
  const { open } = useLayer(props.id);
  useEffect(() => {
    if (!open) setDetail(null);
  }, [open]);
  return (
    <LayerSheet id={props.id} title={detail === null ? props.title : cardName(detail)} halfHeight>
      <CollectorCards
        api={props.api}
        token={props.token}
        detail={detail}
        onOpen={setDetail}
        onBack={() => setDetail(null)}
      />
    </LayerSheet>
  );
}
