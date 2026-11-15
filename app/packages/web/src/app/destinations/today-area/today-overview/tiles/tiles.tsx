import { Suspense } from "react";
import { LayerOpener } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { plurals, texts } from "@/shared/lib/text-rules/texts";
import { todayTexts } from "@/today";
import type { DrawTile, TodayTile } from "../../today-area";

const t = texts(todayTexts);
const plural = plurals(todayTexts);

/** The count that picks the form of the treatments label: only a loaded count counts; while it loads or failed the plural stands (US-QS-32). */
const treatmentsCount = (category: CategoryCount): number | undefined =>
  category.status === "ready" ? category.count : undefined;

/** What a category tile and the summary need of one list (US-QS-18). */
export type CategoryCount = {
  status: "pending" | "ready" | "error";
  count: number | undefined;
};

/**
 * The look of a tile that opens a layer: the control radius (size `sm`), not a pill, so the longest label ("Behandlungen") keeps clear of the
 * rounded edge in a 104 px tile at 360 px (issue 1092). Neutral like every count (US-QS-32, SG-COLOR-02): the card colour and
 * foreground text, no green outline.
 */
const TILE =
  "h-auto min-h-14 w-full flex-col items-center justify-center gap-0 border-transparent bg-card px-1 py-1 text-center text-foreground hover:bg-muted hover:text-foreground";
/**
 * The category tiles: three in a row while a tile holds its label (6.5 rem, 104 px at normal text, starting value); at a
 * larger text size the tiles stack, one per row, so no label runs into its neighbour (issue 1019). The `minmax` is a rem
 * value on purpose, so it grows with the text.
 */
const TILE_GRID = "m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-2 p-0";

/** One tile per category: its name and count as text, the layer opens on choosing it. */
export function CategoryTile(props: { id: string; label: string; category: CategoryCount }) {
  const { category } = props;
  return (
    <li>
      <LayerOpener id={props.id} size="sm" className={TILE}>
        {category.status === "ready" ? (
          // Zero reads as nothing to work through, not as a number to tap (SG-LIST-05): regular and muted.
          <span
            className={
              category.count === 0
                ? "text-lg tabular-nums text-muted-foreground"
                : "text-lg font-semibold tabular-nums"
            }
          >
            {category.count}
          </span>
        ) : category.status === "error" ? (
          <span className="text-sm">{t("tiles.failed")}</span>
        ) : (
          <span className="text-sm text-muted-foreground">{t("tiles.loading")}</span>
        )}
        {/* A space between count and label: the accessible name reads "1 Behandlung" (US-QS-32, F-0071); the flex column shows none. */}{" "}
        <span className="text-sm">{props.label}</span>
      </LayerOpener>
    </li>
  );
}

/** The tile of another module, drawn like the categories; it is ready when it has a count (issue 1156). */
const draw: DrawTile = (n, label, layer) => (
  <CategoryTile id={layer} label={label} category={{ status: "ready", count: n }} />
);

/** The tiles of the categories, then the tiles of other modules (issue 1156). */
export function Tiles(props: {
  treatmentFirst: boolean;
  treatments: CategoryCount;
  watering: CategoryCount;
  hints: CategoryCount;
  more?: readonly TodayTile[];
}) {
  return (
    <ul className={TILE_GRID} aria-label={t("tiles.label")}>
      {!props.treatmentFirst && (
        <CategoryTile
          id="treatments"
          label={plural.word("tiles.treatments", treatmentsCount(props.treatments))}
          category={props.treatments}
        />
      )}
      <CategoryTile id="watering" label={t("tiles.watering")} category={props.watering} />
      <CategoryTile id="hints" label={t("tiles.hints")} category={props.hints} />
      {props.more?.map((x) => (
        <Suspense key={x.id} fallback={null}>
          {x.tile(draw)}
        </Suspense>
      ))}
    </ul>
  );
}
