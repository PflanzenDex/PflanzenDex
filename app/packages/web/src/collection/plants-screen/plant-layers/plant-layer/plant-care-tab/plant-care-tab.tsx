import { lazy, Suspense, type ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router";
import type { SpecimenCard } from "@pflanzendex/core";
import { texts } from "@/shared/lib/text-rules/texts";
import {
  SegmentedControl,
  type SegmentedOption,
} from "@/shared/patterns/elements/segmented-control/segmented-control";
import { LayerOpener, LayerSheet } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import type { PhotoAccess } from "@/shared/platform/browser/use-stored-photo";
import { Quiet } from "../../../../specimens/cards/parts/parts";
import { RepotPlanSection, useRepotPlan } from "../../../../markers/repot/repot-plan/repot-plan";
import table from "./plant-care-tab.de.json";

const t = texts(table);

const CareProfile = lazy(() =>
  import("../../../../care-profile-page/care-profile-page").then((m) => ({
    default: m.CareProfileSection,
  })),
);

const PART_PARAM = "teil";
const PARTS = [
  { value: "behandlungen", label: t("parts.treatments") },
  { value: "profil", label: t("parts.profile") },
] as const;
/** The repot part: offered for a plant while the repot planner is on (US-BES-19), never for a cutting. */
const REPOT_PART = { value: "umtopfen", label: t("parts.repot") } as const;
type Part = "behandlungen" | "profil" | "umtopfen";

/** What the repot part needs: the access to the plan and the action of "Umgetopft" (US-BES-19). */
export type RepotPart = { access: PhotoAccess; onRepot: () => void };

/** The layer of the own care profile of one plant's species (US-QS-23, US-BES-09). */
export const careProfileLayerId = (specimenId: string): string => `profil-${specimenId}`;

/**
 * The part of "Pflege" in the address (`&teil=behandlungen|profil|umtopfen`, absent means treatments). The repot part is
 * chosen only while it is offered; otherwise the address falls back to the treatments. A change replaces the entry and
 * keeps the state of the layer, so Back from the profile layer returns to the same part.
 */
function usePart(repotOffered: boolean): [Part, (value: Part) => void] {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const raw = params.get(PART_PARAM);
  const part: Part =
    raw === "profil"
      ? "profil"
      : raw === REPOT_PART.value && repotOffered
        ? "umtopfen"
        : "behandlungen";
  const choose = (value: Part) => {
    const next = new URLSearchParams(params);
    next.set(PART_PARAM, value);
    setParams(next, { replace: true, state: location.state });
  };
  return [part, choose];
}

/**
 * The own care profile of the plant's species (US-BES-09): a short line and the button that opens its own layer, where
 * the editor loads (a layer loads its data only while it is open, US-QS-22).
 */
function ProfilePart({ card }: { card: SpecimenCard }) {
  return (
    <section aria-labelledby="own-profile" className="grid gap-2">
      <h3 id="own-profile" className="font-semibold">
        {t("profile.title")}
      </h3>
      <Quiet>{t("profile.hint")}</Quiet>
      <LayerOpener id={careProfileLayerId(card.id)}>{t("profile.open")}</LayerOpener>
    </section>
  );
}

/**
 * The layer "Pflegeprofil" of one plant (US-BES-09, US-QS-23): the own care profile of its species with the existing
 * editor. Closing it goes back to the plant layer when the app opened it, so the plant stays where it was.
 */
export function CareProfileLayer(props: { card: SpecimenCard; access: PhotoAccess }) {
  return (
    <LayerSheet id={careProfileLayerId(props.card.id)} title={t("profile.layerTitle")}>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            {t("profile.loading")}
          </p>
        }
      >
        <CareProfile
          api={props.access.api}
          token={props.access.token}
          speciesId={props.card.speciesId}
        />
      </Suspense>
    </LayerSheet>
  );
}

/**
 * "Pflege" of the plant layer (US-QS-23): the segment "Behandlungen | Pflegeprofil", and "Umtopfen" (US-BES-19) for a
 * plant while the repot planner is on. The treatments and the care phase (`care`, a slot) are the first part; the own
 * care profile opens its own layer; the repot plan is its own part, so the tab fits a phone (issue 1328).
 */
export function PlantCareTab(props: {
  card: SpecimenCard;
  care: ReactNode;
  repot?: RepotPart | undefined;
}) {
  const plan = useRepotPlan(props.card, props.repot?.access);
  // The part is offered once the plan is read: not while it loads, not while the keeper switched the planner off.
  const repotOffered =
    props.repot !== undefined && plan.status !== "pending" && plan.value?.hidden !== true;
  const [part, choose] = usePart(repotOffered);
  const options: readonly SegmentedOption<Part>[] = repotOffered ? [...PARTS, REPOT_PART] : PARTS;
  return (
    <div className="grid gap-4">
      <SegmentedControl label={t("parts.label")} options={options} value={part} onChange={choose} />
      {part === "profil" ? <ProfilePart card={props.card} /> : null}
      {part === "behandlungen" ? props.care : null}
      {part === "umtopfen" && props.repot ? (
        <RepotPlanSection
          card={props.card}
          access={props.repot.access}
          plan={plan}
          onRepot={props.repot.onRepot}
        />
      ) : null}
    </div>
  );
}
