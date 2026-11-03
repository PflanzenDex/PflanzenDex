import { SammlungHeader } from "@/app/destinations/collection-area/sammlung-header/sammlung-header";
import { VIEW_LAYER } from "@/app/destinations/collection-area/sammlung-header/view-layer/view-layer";
import { LayerOpener } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { buttonVariants } from "@/shared/ui/button/button";
import { cn } from "@/shared/lib/utils";
import { SAMMLUNG_VIEWS, type SammlungView } from "../../../sammlung-view";

/**
 * The title area of the Sammlung: the switch and, beside the heading, the opener "Ansicht" of the layer that arranges
 * the plants or the species (issue 1096). Wunschliste and Geräte have nothing to arrange; an invisible stand-in of the
 * same size keeps the header's height, so nothing below it jumps between the modes.
 */
export function AreaHeader(props: {
  view: SammlungView;
  caption: string | null;
  onChoose: (v: SammlungView) => void;
}) {
  const arranged = props.view === "plants" || props.view === "species";
  return (
    <SammlungHeader
      view={props.view}
      options={SAMMLUNG_VIEWS}
      onChoose={props.onChoose}
      caption={props.caption}
      action={
        arranged ? (
          <LayerOpener id={VIEW_LAYER}>Ansicht</LayerOpener>
        ) : (
          <span
            aria-hidden="true"
            data-testid="view-stand-in"
            className={cn(buttonVariants({ variant: "outline" }), "invisible")}
          >
            Ansicht
          </span>
        )
      }
    />
  );
}
