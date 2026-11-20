import { SammlungHeader } from "@/app/destinations/collection-area/sammlung-header/sammlung-header";
import { VIEW_LAYER } from "@/collection";
import { LayerOpener } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { texts } from "@/shared/lib/text-rules/texts";
import { SAMMLUNG_VIEWS, useOfferedView, type SammlungView } from "../../../sammlung-view";
import { useShortcuts } from "@/shared/platform/device/keyboard/shortcut-provider/shortcut-provider";
import type { ShortcutId } from "@/shared/platform/device/keyboard/register";
import table from "./area-header.de.json";

const ui = texts(table);

/** The modes that have a shortcut of their own (US-QS-11): the species mode, the wishes the wishlist. */
const SHORTCUT_OF_VIEW: Partial<Record<SammlungView, ShortcutId>> = {
  species: "species",
  wishlist: "wishlist",
};

/**
 * The title area of the Sammlung: the switch and, beside the heading, the opener "Ansicht" of the layer that arranges
 * the plants or the species (issue 1096, US-QS-32: in the top bar below `md`). Wunschliste and Geräte have nothing to
 * arrange, so they have no action: no invisible stand-in keeps an empty row (F-0112).
 */
export function AreaHeader(props: {
  view: SammlungView;
  caption: string | null;
  onChoose: (v: SammlungView) => void;
}) {
  const arranged = props.view === "plants" || props.view === "species";
  const { hint } = useShortcuts();
  const offered = useOfferedView();
  // The switch shows the key of the mode it can reach by one (US-QS-11); the other modes show none. A mode the keeper
  // switched off is not offered (US-ONB-09).
  const options = SAMMLUNG_VIEWS.filter((o) => offered(o.value)).map((o) => {
    const id = SHORTCUT_OF_VIEW[o.value];
    const keyHint = id ? hint(id) : undefined;
    return keyHint ? { ...o, keyHint } : o;
  });
  return (
    <SammlungHeader
      view={props.view}
      options={options}
      onChoose={props.onChoose}
      caption={props.caption}
      reserveCaption
      {...(arranged ? { action: <LayerOpener id={VIEW_LAYER}>{ui("view")}</LayerOpener> } : {})}
    />
  );
}
