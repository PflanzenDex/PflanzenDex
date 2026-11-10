import { CollectionPageSkeleton, DifficultyPageSkeleton } from "@/collection";
import { CarePhasesSkeleton } from "@/care";
import { EquipmentPageSkeleton } from "@/equipment";
import { LightPageSkeleton } from "@/light";
import { PokedexPageSkeleton } from "@/pokedex";
import { WishlistPageSkeleton } from "@/wishlist";
import { LayerHost } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { texts } from "@/shared/lib/text-rules/texts";
import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { Skeleton } from "@/shared/ui/display/skeleton/skeleton";
import type { SammlungShape } from "../../sammlung-view";
import table from "./collection-area.de.json";

const t = texts(table);

/** The modes and arrangements the shape compares, as values (FR-QG-12), the same names as the area's wiring uses. */
const MODE = {
  plants: "plants",
  species: "species",
  wishlist: "wishlist",
  equipment: "equipment",
} as const;
const SORT = { difficulty: "difficulty" } as const;
const GROUP = { phase: "phase" } as const;

/** The skeleton of the mode the shape names, with the mode's own layout (DS-52, DS-53, issue 1727). */
function ModeSkeleton({ shape }: { shape: SammlungShape }) {
  if (shape.managing) return <LightPageSkeleton label={t("loading.light")} />;
  if (shape.view === MODE.wishlist) return <WishlistPageSkeleton label={t("loading.wishlist")} />;
  if (shape.view === MODE.equipment)
    return <EquipmentPageSkeleton label={t("loading.equipment")} />;
  if (shape.view === MODE.species)
    return shape.sort === SORT.difficulty ? (
      <DifficultyPageSkeleton label={t("loading.difficulty")} />
    ) : (
      <PokedexPageSkeleton label={t("loading.species")} />
    );
  return shape.group === GROUP.phase ? (
    <CarePhasesSkeleton label={t("loading.phases")} />
  ) : (
    <CollectionPageSkeleton label={t("loading.plants")} />
  );
}

/**
 * The body of "Sammlung" while its mode loads (US-QS-14, DS-52, issue 1727): the shape of the mode the address names,
 * shown after the delay (DS-57). The title area stays the page's own, so this is the part below it.
 */
export function CollectionModeSkeleton({ shape }: { shape: SammlungShape }) {
  return (
    <DelayedSkeleton>
      <ModeSkeleton shape={shape} />
    </DelayedSkeleton>
  );
}

/**
 * A block of the header: its box keeps the height of the loaded header from the first frame (DS-52), and the block itself
 * shows only after the delay (DS-57), so a fast load draws nothing.
 */
function HeaderBlock({ className }: { className: string }) {
  return (
    <div className={className}>
      <DelayedSkeleton>
        <Skeleton className="h-full w-full rounded-full" />
      </DelayedSkeleton>
    </div>
  );
}

/**
 * The route's fallback of "Sammlung" until its chunk is there (issue 1727, as "Entdecken" in issue 1697): the title stands
 * at once as the one h1 (its focus waits for the page's own heading, RouteFocus), the switch and the action keep the
 * height of the loaded header, and the blocks and the mode's body wait for the delay.
 */
export function CollectionRouteSkeleton({ shape }: { shape: SammlungShape }) {
  const arranged = shape.view === MODE.plants || shape.view === MODE.species;
  // The frame of `CollectionArea`, one screen like it (US-QS-15, US-QS-19): the same fit attributes, so the frame has the
  // height of the loaded page and nothing below the title moves when the page replaces the fallback.
  return (
    <LayerHost className="min-h-0" data-fit-screen="" data-fit-fill="">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="mb-1.5 flex flex-col gap-1.5">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <h1 data-route-fallback="" className="text-2xl font-semibold">
              {t("title")}
            </h1>
            {arranged ? (
              <HeaderBlock className="h-11 w-24 shrink-0" />
            ) : (
              <span aria-hidden="true" className="block h-11 w-24" />
            )}
          </div>
          <HeaderBlock className="h-[52px] w-72 max-w-full" />
        </div>
        <CollectionModeSkeleton shape={shape} />
      </div>
    </LayerHost>
  );
}
