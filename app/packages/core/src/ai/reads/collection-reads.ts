// The keeper's collection through the AI interface (US-KI-11): specimens, locations, light zones and the measurements of
// one specimen, each item with its id and its readable name, so the client can refer by name later (FR-KI-15). Every list
// is paged with a stable order (FR-KI-16) and holds only the account's own rows (P-04).
import {
  appError,
  choiceField,
  failed,
  ok,
  orNull,
  shape,
  textField,
  timeZoneField,
} from "../../kernel";
import { resolveSpecies, type ReadDependencies } from "./catalog-reads";
import { referenceError, resolveName, type Named } from "./naming";
import { PAGE_FIELDS, pageOf, readCall, type ReadCall, type SpecimenItem } from "./types";
import { collectionView, type CollectionView, type SpecimenOut } from "./views";

const ref = (field: string) => orNull(textField(field, { min: 1, max: 200 }));

export const listSpecimensSchema = shape({
  timeZone: timeZoneField("timeZone"),
  status: orNull(choiceField("status", ["active", "archived", "all"] as const)),
  species: ref("species"),
  location: ref("location"),
  lightZone: ref("lightZone"),
  ...PAGE_FIELDS,
});
export const getSpecimenSchema = shape({
  specimen: textField("specimen", { min: 1, max: 200 }),
  timeZone: timeZoneField("timeZone"),
});
export const listMeasurementsSchema = shape({
  specimen: textField("specimen", { min: 1, max: 200 }),
  ...PAGE_FIELDS,
});
export const listPlacesSchema = shape({ ...PAGE_FIELDS });

const NO_MORE_NAMES = (): string[] => [];
const named = (
  items: readonly { id: string; name: string }[],
  extra: (id: string) => string[] = NO_MORE_NAMES,
) => items.map((i): Named => ({ id: i.id, label: i.name, names: [i.name, ...extra(i.id)] }));

/** A location or light zone reference resolved among the account's own (FR-KI-15); `null` when none was given. */
function resolvePlace(view: CollectionView, kind: "location" | "lightZone", value: string | null) {
  if (value === null) return ok(null);
  const zoneNumber = (id: string) => [String(view.zoneNumbers.get(id) ?? "")];
  const r =
    kind === "location"
      ? resolveName(named(view.locations), value)
      : resolveName(named(view.zones, zoneNumber), value);
  const code = kind === "location" ? "location.not_found" : "light_zone.not_found";
  return r.kind === "found" ? ok(r.id) : failed(referenceError(r, kind, code));
}

/** A specimen reference among the account's specimens: the active ones first, then the archive (US-BES-07). */
function resolveSpecimen(rows: readonly SpecimenItem[], value: string) {
  const active = rows.filter((s) => s.status !== "archived");
  const first = resolveName(named(active), value);
  const r = first.kind === "none" ? resolveName(named(rows), value) : first;
  return r.kind === "found"
    ? ok(r.id)
    : failed(referenceError(r, "specimen", "specimen.not_found"));
}

const statusFits = (status: "active" | "archived" | "all" | null) => (s: SpecimenOut) =>
  status === "all" || (status === "archived") === (s.status === "archived");

const SPECIMEN_DATA = ["name", "marker", "species.name", "location.name", "lightZone.name"];

/** My specimens (active by default, archived on request), filtered by species, location or zone given by id or name. */
export const aiListSpecimens = (deps: ReadDependencies, call: ReadCall) =>
  readCall(deps, call, "list_specimens", {
    schema: listSpecimensSchema,
    run: async (input) => {
      const view = await collectionView(deps.source, call.userId, input.timeZone);
      const species = input.species
        ? await resolveSpecies(deps, call.userId, input.species)
        : ok(null);
      if (!species.ok) return species;
      const location = resolvePlace(view, "location", input.location);
      if (!location.ok) return location;
      const zone = resolvePlace(view, "lightZone", input.lightZone);
      if (!zone.ok) return zone;
      const all = view.specimens
        .filter(statusFits(input.status ?? "active"))
        .filter((s) => species.value === null || s.species.id === species.value)
        .filter((s) => location.value === null || s.location?.id === location.value)
        .filter((s) => zone.value === null || s.lightZone?.id === zone.value);
      return ok({ ...pageOf(all, input), dataFields: SPECIMEN_DATA.map((f) => `items[].${f}`) });
    },
    effect: (v) => `${v.items.length} of ${v.total} specimens`,
  });

/** One specimen by id or name, with its location, effective light zone and status as the app shows them. */
export const aiGetSpecimen = (deps: ReadDependencies, call: ReadCall) =>
  readCall(deps, call, "get_specimen", {
    schema: getSpecimenSchema,
    run: async (input) => {
      const view = await collectionView(deps.source, call.userId, input.timeZone);
      const id = resolveSpecimen(view.rows, input.specimen);
      if (!id.ok) return id;
      const item = view.specimens.find((s) => s.id === id.value);
      const details = item ? await deps.source.specimen(call.userId, item.id) : null;
      if (!item || !details)
        return failed(appError("specimen.not_found", { data: { nearest: [] } }));
      return ok({
        specimen: { ...item, details },
        dataFields: SPECIMEN_DATA.map((f) => `specimen.${f}`),
      });
    },
    effect: () => "one specimen",
  });

/** My locations with their light zone, ordered by name. */
export const aiListLocations = (deps: ReadDependencies, call: ReadCall) =>
  readCall(deps, call, "list_locations", {
    schema: listPlacesSchema,
    run: async (input) => {
      const view = await collectionView(deps.source, call.userId, null);
      return ok({ ...pageOf(view.locationItems, input), dataFields: ["items[].name"] });
    },
    effect: (v) => `${v.items.length} of ${v.total} locations`,
  });

/** My light zones with number (1 is cutting light) and name, ordered by number. */
export const aiListLightZones = (deps: ReadDependencies, call: ReadCall) =>
  readCall(deps, call, "list_light_zones", {
    schema: listPlacesSchema,
    run: async (input) => {
      const view = await collectionView(deps.source, call.userId, null);
      return ok({ ...pageOf(view.zoneItems, input), dataFields: ["items[].name"] });
    },
    effect: (v) => `${v.items.length} of ${v.total} light zones`,
  });

/** The measurements of one specimen (US-WAC-01), newest first as in the app, with the derived growth trend. */
export const aiListMeasurements = (deps: ReadDependencies, call: ReadCall) =>
  readCall(deps, call, "list_measurements", {
    schema: listMeasurementsSchema,
    run: async (input) => {
      const rows = await deps.source.specimens(call.userId, "UTC");
      const id = resolveSpecimen(rows, input.specimen);
      if (!id.ok) return id;
      const view = await deps.source.measurements(call.userId, id.value);
      const specimen = rows.find((s) => s.id === id.value);
      if (!view || !specimen)
        return failed(appError("specimen.not_found", { data: { nearest: [] } }));
      const { measurements, ...rest } = view;
      const page = pageOf(measurements, input);
      return ok({
        ...rest,
        specimen: { id: specimen.id, name: specimen.name },
        ...page,
        dataFields: ["specimen.name", "items[].note"],
      });
    },
    effect: (v) => `${v.items.length} of ${v.total} measurements`,
  });
