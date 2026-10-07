import { Suspense } from "react";
import { useNavigate } from "react-router";
import { AreaSection as Section } from "@/components/routing/areas/area-section/area-section";
import { useSectionAnchor } from "@/components/routing/areas/area-section/use-section-anchor";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { HintsPage } from "@/collection";
import { TreatmentsPage } from "@/care";
import { TodayPage, type TodayDestination } from "@/today";
import { TODAY_SECTIONS, todayAddress, type View } from "@/navigation";

type Token = () => Promise<string | undefined>;

/** Where the actions of "Jetzt dran" lead (TE-07): treatments and hints are sections right below, the rest are views. */
const VIEW: Partial<Record<TodayDestination, View>> = {
  care_phases: "carePhases",
  collection: "collection",
};

const NAMES: Record<string, string> = {
  [TODAY_SECTIONS.treatments]: "Behandlungen",
  [TODAY_SECTIONS.hints]: "Fehlt noch",
};

/**
 * The destination "Heute" (US-QS-14): the list "Jetzt dran" (`today`), the open treatments with planning and history
 * (`care`) and the hints about incomplete plants (`collection`) as sections one below the other. The app wires the
 * modules (they do not know each other); every section is its own lazy part, so the shell does not carry them. The
 * old addresses of "Behandlung" and "Hinweise" lead to the anchors of the sections.
 */
export function TodayArea(props: { api: string; token: Token; onOpen: (view: View) => void }) {
  const navigate = useNavigate();
  useSectionAnchor(NAMES);
  const open = (d: TodayDestination) => {
    // Same page: the state keeps the focus where useSectionAnchor puts it (RouteFocus leaves it alone).
    if (d === "treatments" || d === "hints")
      return void navigate(todayAddress(d), { state: { keepFocus: true } });
    const view = VIEW[d];
    if (view) props.onOpen(view);
  };
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Suspense fallback={<TodaySkeleton />}>
        <TodayPage api={props.api} token={props.token} onOpen={open} />
      </Suspense>
      <Section
        anchor={TODAY_SECTIONS.treatments}
        title="Behandlungen"
        loading="Behandlungen werden geladen …"
      >
        <TreatmentsPage api={props.api} token={props.token} host />
      </Section>
      <Section anchor={TODAY_SECTIONS.hints} title="Fehlt noch" loading="Hinweise werden geladen …">
        <HintsPage api={props.api} token={props.token} onOpen={props.onOpen} host />
      </Section>
    </div>
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
