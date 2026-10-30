import { Suspense, useEffect, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  LayerSheet,
  LAYER_SLOT,
  useLayer,
} from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { Skeleton, SkeletonGroup } from "@/components/ui/display/skeleton/skeleton";
import { HintsPage } from "@/collection";
import { TreatmentsPage } from "@/care";
import { WateringList } from "@/monitoring";
import { LazyAnniversaries } from "@/components/routing/areas/shared/lazy-anniversaries/lazy-anniversaries";
import { type TodayDestination } from "@/today";
import {
  todayAddress,
  type LinkTarget,
  type TodaySection,
} from "@/components/shared/navigation/nav-model/navigation/navigation";
import { TodayOverview } from "./today-overview/today-overview";

type Token = () => Promise<string | undefined>;

/** Where the actions of "Jetzt dran" lead (TE-07): treatments and hints open their layer, the rest are views. */
const VIEW: Partial<Record<TodayDestination, LinkTarget>> = {
  care_phases: "carePhases",
  collection: "collection",
  // Measuring and the wishlist live in the Sammlung (US-QS-14, US-QS-04).
  measurements: "collection",
  wishlist: "collection",
  equipment: "collection",
};

/**
 * The destination "Heute" as one screen (US-QS-18): the date, a summary, the most urgent item of "Jetzt dran" (`today`)
 * and one tile per category. A tile opens its items as a layer above the overview (`?sheet=treatments|watering|hints`):
 * the open treatments with planning and history (`care`), the watering (`monitoring`, US-MON-05) and the hints about
 * incomplete plants (`collection`). The app wires the modules (they do not know each other); the layers load as their
 * own lazy parts, so the shell does not carry them. The former anchors (`/today#behandlungen`) open the layer.
 */
export function TodayArea(props: {
  api: string;
  token: Token;
  onOpen: (view: LinkTarget) => void;
  /**
   * The introduction around the overview (US-QS-16): the app wires it in, because the area must not import the shell
   * (the shell imports the routes). Without it the overview shows alone.
   */
  intro?: (sections: ReactNode, fallback: ReactNode) => ReactNode;
}) {
  useFormerAnchors();
  const treatments = useLayer("treatments");
  const hints = useLayer("hints");
  const open = (d: TodayDestination) => {
    if (d === "treatments") return treatments.openLayer();
    if (d === "hints") return hints.openLayer();
    const view = VIEW[d];
    if (view) props.onOpen(view);
  };
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_auto]" data-fit-screen="">
      <Suspense fallback={<TodaySkeleton />}>
        {props.intro ? (
          props.intro(<Tasks {...props} open={open} />, <TodaySkeleton />)
        ) : (
          <Tasks {...props} open={open} />
        )}
      </Suspense>
    </div>
  );
}

/**
 * The former anchors of the sections of "Heute", e.g. `/today#behandlungen` (US-QS-14): old bookmarks still work, the
 * area replaces them by the layer of the same name (US-QS-18).
 */
const TODAY_SECTIONS: Record<TodaySection, string> = {
  treatments: "behandlungen",
  watering: "giessen",
  hints: "fehlt-noch",
};

/** A former address `/today#behandlungen` opens the layer and is replaced by its address (US-QS-18). */
function useFormerAnchors() {
  const { hash } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const section = (Object.keys(TODAY_SECTIONS) as TodaySection[]).find(
      (key) => TODAY_SECTIONS[key] === hash.slice(1),
    );
    if (section)
      void navigate(todayAddress(section), { replace: true, state: { keepFocus: true } });
  }, [hash, navigate]);
}

/** The overview of the day with the layers of its categories. */
function Tasks(props: {
  api: string;
  token: Token;
  onOpen: (view: LinkTarget) => void;
  open: (d: TodayDestination) => void;
}) {
  const { api, token } = props;
  // The counts come from the same requests and keys as the lists in the layers: both share one copy and a write
  // updates both. Each module hands its count over (`count`); the app nests them, the modules do not know each other.
  return (
    <>
      <Suspense fallback={<TodaySkeleton />}>
        <TodayOverview api={api} token={token} onOpen={props.onOpen} open={props.open} />
      </Suspense>
      <LazyAnniversaries api={api} token={token} onOpen={() => props.onOpen("collection")} />
      <div className={LAYER_SLOT}>
        <LayerSheet id="treatments" title="Behandlungen">
          <InLayer loading="Behandlungen werden geladen …">
            <TreatmentsPage api={api} token={token} host />
          </InLayer>
        </LayerSheet>
        <LayerSheet id="watering" title="Gießen">
          <InLayer loading="Gießliste wird geladen …">
            <WateringList api={api} token={token} />
          </InLayer>
        </LayerSheet>
        <LayerSheet id="hints" title="Fehlt noch">
          <InLayer loading="Hinweise werden geladen …">
            <HintsPage api={api} token={token} onOpen={props.onOpen} host />
          </InLayer>
        </LayerSheet>
      </div>
    </>
  );
}

/** Keeps the place of the title and the first list while the part of "Jetzt dran" loads. */
function TodaySkeleton() {
  return (
    <SkeletonGroup label="Heute wird geladen …" className="flex min-w-0 flex-col gap-3">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-24 w-full rounded-card" />
    </SkeletonGroup>
  );
}

/** The content of a layer loads on its own, with a skeleton and one loading status meanwhile (DS-52). */
function InLayer(props: { loading: string; children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <SkeletonGroup label={props.loading} className="flex min-w-0 flex-col gap-3">
          <Skeleton className="h-24 w-full rounded-card" />
          <Skeleton className="h-24 w-full rounded-card" />
        </SkeletonGroup>
      }
    >
      {props.children}
    </Suspense>
  );
}
