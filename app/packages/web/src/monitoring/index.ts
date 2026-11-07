// Public interface of the module `monitoring` (ADR 0003): the reminders of an account (inbox, settings, push devices; US-MON-01, US-MON-08) and watering without a sensor (US-MON-05), also as the button "Gießen" of a plant (US-QS-23).
import { lazyPage } from "@/shared/platform/routing/lazy-page/lazy-page";
export const RemindersSection = lazyPage(() =>
  import("./reminders-section/reminders-section").then((m) => ({ default: m.RemindersSection })),
);
export const WateringList = lazyPage(() =>
  import("./watering/watering-list/watering-list").then((m) => ({ default: m.WateringList })),
);
export const WaterAction = lazyPage(() =>
  import("./watering/water-action/water-action").then((m) => ({ default: m.WaterAction })),
);
/** "Gegossen" of one plant from the outside, e.g. the scanned pot label (US-BES-17): the same write as the list on "Heute". */
export { markWatered } from "./api/reminders-api";
