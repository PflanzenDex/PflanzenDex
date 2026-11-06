import { Link } from "react-router";
import { SammlungHeader } from "@/app/destinations/collection-area/sammlung-header/sammlung-header";
import { VIEW_LAYER } from "@/collection";
import { useFeature } from "@/shared/data";
import { LABELS_PATH } from "@/shared/patterns/navigation/navigation/navigation";
import { LayerOpener } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { buttonVariants } from "@/shared/ui/button/button";
import { cn } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import { SAMMLUNG_VIEWS, useOfferedView, type SammlungView } from "../../../sammlung-view";
import { useShortcuts } from "@/shared/platform/device/keyboard/shortcut-provider/shortcut-provider";
import type { ShortcutId } from "@/shared/platform/device/keyboard/register";
import table from "./area-header.de.json";

const ui = texts(table);

/** The modes that have a shortcut of their own (US-QS-11): the Pokédex is the species mode, the wishes the wishlist. */
const SHORTCUT_OF_VIEW: Partial<Record<SammlungView, ShortcutId>> = {
  species: "species",
  wishlist: "wishlist",
};

/**
 * The title area of the Sammlung: the switch and, beside the heading, the opener "Ansicht" of the layer that arranges
 * the plants or the species (issue 1096); below the switch the print of the pot labels for the plants (US-BES-17). Wunschliste and Geräte have nothing to arrange; an invisible stand-in of the
 * same size keeps the header's height, so nothing below it jumps between the modes.
 */
export function AreaHeader(props: {
  view: SammlungView;
  caption: string | null;
  onChoose: (v: SammlungView) => void;
}) {
  const arranged = props.view === "plants" || props.view === "species";
  // The print of the pot labels hangs beside the plants (US-BES-17); the keeper switch "pot_labels" hides it (P-12).
  const labels = useFeature("pot_labels") && props.view === "plants";
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
      action={
        arranged ? (
          <LayerOpener id={VIEW_LAYER}>{ui("view")}</LayerOpener>
        ) : (
          <span
            aria-hidden="true"
            data-testid="view-stand-in"
            className={cn(buttonVariants({ variant: "outline" }), "invisible")}
          >
            {ui("view")}
          </span>
        )
      }
    >
      {/* Below the switch, so the order of the tab stops of the title area stays: opener, switch, then this link. */}
      {labels ? (
        <Link to={LABELS_PATH} className={cn(buttonVariants({ variant: "outline" }), "self-start")}>
          {ui("labels")}
        </Link>
      ) : null}
    </SammlungHeader>
  );
}
