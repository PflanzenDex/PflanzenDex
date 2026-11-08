import { localToday } from "@pflanzendex/core";
import { currentTimeZone } from "../../../shared/data";

/**
 * The keeper's local today (profile time zone, NFR-08), the preset and upper limit of the catch date field. Its own
 * module, so the marker step of a further plant takes it without the field's code (issue 1638).
 */
export const useToday = (): string => localToday(new Date(), currentTimeZone());
