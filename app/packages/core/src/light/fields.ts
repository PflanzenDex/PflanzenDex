import { integerField, idField, shape, orNull, textField, choiceField } from "../kernel";
import { LIMITS, LOCATION_KINDS } from "./types";

const zoneFields = {
  name: textField("name", LIMITS.name),
  luxCeiling: integerField("luxCeiling", LIMITS.luxCeiling),
  ppfd: orNull(integerField("ppfd", LIMITS.ppfd)),
  sortOrder: orNull(integerField("sortOrder", LIMITS.sortOrder)),
};
export const zoneSchema = shape(zoneFields);
export const zoneUpdateSchema = shape({ id: idField("id"), ...zoneFields });
export const zoneIdSchema = shape({ id: idField("id") });

const locationFields = {
  name: textField("name", LIMITS.name),
  lightZoneId: orNull(idField("lightZoneId")),
  kind: choiceField("kind", LOCATION_KINDS),
};
export const locationSchema = shape(locationFields);
export const locationUpdateSchema = shape({ id: idField("id"), ...locationFields });
