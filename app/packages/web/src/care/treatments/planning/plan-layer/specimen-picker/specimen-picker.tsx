import { useId, useState, type MutableRefObject } from "react";
import type { ControllerRenderProps, Control } from "react-hook-form";
import { Checkbox } from "@/shared/ui/checkbox";
import { FormField, FormItem, FormMessage } from "@/shared/ui/form";
import { SearchInput } from "@/shared/ui/search-input";
import { Select } from "@/shared/ui/select";
import { Label } from "@/shared/ui/label";
import { ScrollEntries } from "@/shared/patterns/responsive/pager/paging/scroll-entries/scroll-entries";
import { useIsMd } from "@/shared/platform/browser/use-breakpoint";
import { texts } from "@/shared/lib/text-rules/texts";
import type { TreatableSpecimen } from "../../../../shared/api/treatments-api";
import type { TreatmentFields } from "../../../../shared/schemas";
import table from "../plan-layer.de.json";

const ui = texts(table);

/** The value of the location filter for plants without a location (P-08); no real location has this name. */
const UNKNOWN_PLACE = "__unknown__";
/**
 * Plants per page of the choice (starting values, assumption; US-QS-15): three on a phone (owner decision 2026-11-20,
 * FX-24: the layer fits 360 x 640), six from 768 px.
 */
const PICK_PAGE_SIZE = { phone: 3, md: 6 } as const;

type Field = ControllerRenderProps<TreatmentFields, "specimenIds">;

const normal = (text: string) => text.trim().toLocaleLowerCase("de-DE");

/** Plants whose name holds the search text and that stand at the chosen location (US-BEH-01). */
function shownPlants(
  specimens: readonly TreatableSpecimen[],
  query: string,
  place: string,
): TreatableSpecimen[] {
  const q = normal(query);
  return specimens.filter(
    (s) =>
      normal(s.name).includes(q) &&
      (place === "" || (place === UNKNOWN_PLACE ? !s.location : s.location === place)),
  );
}

/**
 * The search field on its own full-width line at the top, the location filter below it as a labelled field (US-QS-32,
 * issue 1960). "Standort unbekannt" appears only when some plant has none. Below 480 px both stack at full width, so
 * "Alle Standorte" is never cut; from 480 px they share one row.
 */
function PickFilters(props: {
  specimens: readonly TreatableSpecimen[];
  query: string;
  onQuery: (query: string) => void;
  place: string;
  onPlace: (place: string) => void;
}) {
  const { specimens, place } = props;
  const placeId = useId();
  const places = [...new Set(specimens.flatMap((s) => (s.location ? [s.location] : [])))].sort(
    (a, b) => a.localeCompare(b, "de"),
  );
  return (
    // Below 480 px both stack at full width; from 480 px the search and the location share one row (issue 1960).
    <div className="flex min-w-0 flex-col gap-3 min-[480px]:flex-row min-[480px]:items-end">
      <SearchInput
        aria-label={ui("pick.search")}
        placeholder={ui("pick.searchPlaceholder")}
        autoComplete="off"
        value={props.query}
        onChange={(e) => props.onQuery(e.target.value)}
        onClear={() => props.onQuery("")}
        className="w-full min-[480px]:min-w-0 min-[480px]:flex-1"
      />
      <div className="flex min-w-0 flex-col gap-1 min-[480px]:w-44 min-[480px]:shrink-0">
        <Label htmlFor={placeId}>{ui("pick.place")}</Label>
        <Select id={placeId} value={place} onChange={(e) => props.onPlace(e.target.value)}>
          <option value="">{ui("pick.allPlaces")}</option>
          {places.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          {specimens.some((s) => !s.location) && (
            <option value={UNKNOWN_PLACE}>{ui("pick.unknownPlace")}</option>
          )}
        </Select>
      </div>
    </div>
  );
}

/** The checkboxes of the shown plants in pages; the choice lives in the form field and survives the pages. */
function PickList(props: {
  field: Field;
  invalid: boolean;
  shown: readonly TreatableSpecimen[];
  pageSize: number;
  resetKey: string;
  focusRef?: MutableRefObject<HTMLInputElement | null>;
}) {
  const { field } = props;
  const toggle = (id: string) =>
    field.onChange(
      field.value.includes(id) ? field.value.filter((x) => x !== id) : [...field.value, id],
    );
  if (props.shown.length === 0)
    return <p className="text-sm text-muted-foreground">{ui("pick.none")}</p>;
  return (
    <ScrollEntries
      items={props.shown}
      pageSize={props.pageSize}
      label={ui("pick.label")}
      resetKey={props.resetKey}
      getKey={(s) => s.id}
      renderItem={(s, index) => (
        <Checkbox
          name={field.name}
          ref={(el) => {
            if (index === 0 && props.focusRef) props.focusRef.current = el;
          }}
          onBlur={field.onBlur}
          invalid={props.invalid}
          checked={field.value.includes(s.id)}
          onChange={() => toggle(s.id)}
        >
          {s.name}
          <span className="block text-sm text-muted-foreground">
            {s.location ?? ui("pick.unknownPlace")}
          </span>
        </Checkbox>
      )}
    />
  );
}

/**
 * The plants to plan for, as a search, a location filter and pages of checkboxes (US-BEH-01, US-QS-15). The choice is
 * kept across pages; a changed search or location starts at page 1 and says when nothing matches (P-09). It writes the
 * form field `specimenIds`, the same field as the plant layer's form.
 */
export function SpecimenPicker(props: {
  control: Control<TreatmentFields>;
  specimens: readonly TreatableSpecimen[];
  /** Receives the first checkbox of the first page, so a refused choice can move the focus there. */
  focusRef?: MutableRefObject<HTMLInputElement | null>;
}) {
  const { control, specimens } = props;
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState("");
  const pageSize = useIsMd() ? PICK_PAGE_SIZE.md : PICK_PAGE_SIZE.phone;
  const shown = shownPlants(specimens, query, place);
  return (
    <FormField
      control={control}
      name="specimenIds"
      render={({ field, fieldState }) => (
        <FormItem>
          <PickFilters
            specimens={specimens}
            query={query}
            onQuery={setQuery}
            place={place}
            onPlace={setPlace}
          />
          <PickList
            field={field}
            invalid={Boolean(fieldState.error)}
            shown={shown}
            pageSize={pageSize}
            resetKey={`${query}|${place}`}
            {...(props.focusRef ? { focusRef: props.focusRef } : {})}
          />
          <div className="min-h-5">
            <FormMessage />
          </div>
        </FormItem>
      )}
    />
  );
}
