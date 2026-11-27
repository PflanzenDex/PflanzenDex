import type { SpecimenCard, SpecimenSummary } from "@pflanzendex/core";
import { Link } from "react-router";
import { GroupSections } from "@/shared/lists/grouped-list/grouped-sections/grouped-sections";
import {
  GroupSection,
  type SectionGroup,
} from "@/shared/lists/grouped-list/grouped-sections/group-section/group-section";
import { OBJECT_GROUP } from "@/shared/lists/grouped-list/group-classes";
import { todayAddress } from "@/shared/patterns/navigation/navigation/navigation";
import type { PhotoAccess } from "@/shared/platform/browser/use-stored-photo";
import { Button } from "@/shared/ui/button";
import { texts } from "@/shared/lib/text-rules/texts";
import { useCardPages } from "../../specimens/cards/use-card-pages";
import { PlantTile } from "../rows/plant-tile/plant-tile";
import {
  groupTitle,
  locationChoices,
  UNPLACED_KEY,
} from "../rows/location-groups/group-by-location";
import { pagingOf, usePageSize } from "../plants-parts/plants-paging/plants-paging";
import table from "../plant-layers/plant-layers.de.json";

const t = texts(table);

type Choice = ReturnType<typeof locationChoices>[number];

/**
 * "Standort setzen" in the label of the group "Standort unbekannt" (SG-LIST-06): the plants without a location are named in
 * "Fehlt noch" of Heute, where each has its location choice (FR-PHA-03). It is the one action of the label.
 */
function SetLocation() {
  return (
    <Button asChild variant="plain" size="sm" className="shrink-0">
      <Link to={todayAddress("hints")}>{t("locate")}</Link>
    </Button>
  );
}

/**
 * One location as a section (US-QS-14): its plants load with the location filter, part by part (FR-BES-23). The heading names
 * the place, its zone and the number of plants of the server's summary; the zone is the first plant's, as before, and is left
 * out until the first part is loaded (P-08). The plants without a place carry the one action that sets it.
 */
function LocationSection(props: { choice: Choice; photoAccess: PhotoAccess; end: number | false }) {
  const { choice: c, photoAccess } = props;
  const list = useCardPages(photoAccess.api, photoAccess.token, {
    location: c.key === UNPLACED_KEY ? "none" : c.key,
  });
  const zone = list.status === "ready" ? (list.cards[0]?.lightZone ?? null) : undefined;
  const group: SectionGroup<SpecimenCard> = {
    key: c.key,
    label: c.label,
    count: c.count,
    items: list.cards,
    heading: groupTitle(c.label, zone, c.count),
    paging: pagingOf(list, c.count),
    ...(c.key === UNPLACED_KEY ? { action: <SetLocation /> } : {}),
  };
  return <GroupSection group={group} end={props.end} />;
}

/**
 * The plants by location (US-QS-14, SG-LIST-06): every location is a section of one scrolling list, in the alphabetical order
 * of the summary, the plants without a place last as "Standort unbekannt"; only places with plants appear (an open set). The
 * chips jump to a section. Each section loads its own plants and its own end rows; the last one ends the list with the count of
 * all plants.
 */
export function LocationSections(props: {
  summary: SpecimenSummary;
  photoAccess: PhotoAccess;
  /** The heading level of the locations: one below the heading of the page or of its section (SG-HEAD-03). */
  level: 2 | 3;
}) {
  const choices = locationChoices(props.summary.groups, props.summary.unplaced);
  const total = choices.reduce((n, c) => n + c.count, 0);
  const size = usePageSize();
  const groups: SectionGroup<SpecimenCard>[] = choices.map((c) => ({
    key: c.key,
    label: c.label,
    count: c.count,
    items: [],
  }));
  return (
    <GroupSections
      label={t("list.label")}
      jumpLabel={t("jump")}
      level={props.level}
      groups={groups}
      list={{
        listLabel: t("list.label"),
        pageSize: size,
        listClassName: OBJECT_GROUP,
        getKey: (card) => card.id,
        renderItem: (card) => <PlantTile card={card} access={props.photoAccess} />,
      }}
    >
      {choices.map((c, i) => (
        <LocationSection
          key={c.key}
          choice={c}
          photoAccess={props.photoAccess}
          end={i === choices.length - 1 ? total : false}
        />
      ))}
    </GroupSections>
  );
}
