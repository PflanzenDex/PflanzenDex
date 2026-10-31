import { useState, type MutableRefObject } from "react";
import type { ControllerRenderProps, Control } from "react-hook-form";
import { Checkbox } from "@/components/ui/fields/checkbox/checkbox";
import { FormField, FormItem, FormMessage } from "@/components/ui/fields/form/form";
import { Input } from "@/components/ui/fields/input/input";
import { Select } from "@/components/ui/fields/select/select";
import { Pager, LAYER_PARAM } from "@/components/shared/responsive/pager/pager";
import { useIsMd } from "@/lib/use-breakpoint";
import type { TreatableSpecimen } from "../../../../shared/api/treatments-api";
import type { TreatmentFields } from "../../../../shared/schemas";

/** The value of the location filter for plants without a location (P-08); no real location has this name. */
const UNKNOWN_PLACE = "__unknown__";
/** Plants per page of the choice (starting values, assumption; US-QS-15): four on a phone, six from 768 px. */
const PICK_PAGE_SIZE = { phone: 4, md: 6 } as const;

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

/** The search field and the location filter in one row; "Standort unbekannt" appears only when some plant has none. */
function PickFilters(props: {
  specimens: readonly TreatableSpecimen[];
  query: string;
  onQuery: (query: string) => void;
  place: string;
  onPlace: (place: string) => void;
}) {
  const { specimens, place } = props;
  const places = [...new Set(specimens.flatMap((s) => (s.location ? [s.location] : [])))].sort(
    (a, b) => a.localeCompare(b, "de"),
  );
  return (
    <div className="flex min-w-0 gap-2">
      <Input
        type="search"
        aria-label="Pflanze suchen"
        placeholder="Pflanze suchen"
        autoComplete="off"
        value={props.query}
        onChange={(e) => props.onQuery(e.target.value)}
        className="min-w-0 flex-1"
      />
      <Select
        aria-label="Standort"
        value={place}
        onChange={(e) => props.onPlace(e.target.value)}
        className="w-36 shrink-0"
      >
        <option value="">Alle Standorte</option>
        {places.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
        {specimens.some((s) => !s.location) && (
          <option value={UNKNOWN_PLACE}>Standort unbekannt</option>
        )}
      </Select>
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
    return (
      <p className="text-sm text-muted-foreground">
        Keine Pflanze passt. Ändere die Suche oder den Standort.
      </p>
    );
  return (
    <Pager
      items={props.shown}
      pageSize={props.pageSize}
      label="Pflanzen"
      param={LAYER_PARAM}
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
            {s.location ?? "Standort unbekannt"}
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
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
