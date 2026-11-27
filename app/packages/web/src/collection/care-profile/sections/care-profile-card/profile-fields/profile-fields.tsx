import type { Control } from "react-hook-form";
import type { CareProfileChanges, CareProfileEntry } from "@pflanzendex/core";
import { ScrollEntries } from "@/shared/patterns/responsive/pager/paging/scroll-entries/scroll-entries";
import type { CareProfileFields } from "../../../../specimens/model/schemas";
import {
  Days,
  Dormancy,
  Hints,
  Places,
  type Lists,
} from "../../care-profile-sections/care-profile-sections";

/** What every field of the profile gets: the entry, the form, the reset of a field to the catalog and the busy state. */
export type ProfileShared = {
  entry: CareProfileEntry;
  control: Control<CareProfileFields>;
  reset: (changes: CareProfileChanges, label: string) => void;
  busy: boolean;
};

/** Five groups of at most two fields each, one list entry per group (US-QS-23). */
const PAGES = [0, 1, 2, 3, 4] as const;

/** The fields of one group, in the order of the form: the locations, the zone, the dormancy period, the watering, the hints. */
function pageFields(page: number, shared: ProfileShared, lists: Lists) {
  if (page === 0) return <Places {...shared} lists={lists} fields={["growth", "dormancy"]} />;
  if (page === 1) return <Places {...shared} lists={lists} fields={["zone"]} />;
  if (page === 2) return <Dormancy {...shared} />;
  if (page === 3) return <Days {...shared} />;
  return <Hints {...shared} />;
}

/**
 * The fields of the care profile as one scrolling list of five groups (US-BES-09, US-QS-23): on a page and in a layer
 * alike, with no pages and no position in the address (US-QS-15, issue 2418); the values of all groups stay in the form.
 */
export function ProfileFields(props: { shared: ProfileShared; lists: Lists; name: string }) {
  const { shared, lists, name } = props;
  return (
    <ScrollEntries
      items={PAGES}
      pageSize={1}
      label={`Felder des Pflegeprofils für „${name}“`}
      renderItem={(page) => <div className="grid gap-1">{pageFields(page, shared, lists)}</div>}
    />
  );
}
