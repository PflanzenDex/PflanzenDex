import { localToday } from "@pflanzendex/core";
import {
  accountKey,
  appendKey,
  currentTimeZone,
  entityKey,
  useWriteAction,
} from "../../../shared/data";
import { describeLamp, measureLamp, setDeviationLimit } from "../../equipment-api";
import type { LampLightActions } from "../../lamp-light/lamp-light";

type Write = ReturnType<typeof useWriteAction>;

/**
 * The writes on the light intensity (US-EQU-03): a measurement, the manufacturer's statement, the limit. Each write is
 * keyed to its lamp or to the account (US-QS-03).
 */
export function lightWrites(api: string, write: Write): LampLightActions {
  return {
    busy: write.running,
    onMeasure: async (lamp, input) => {
      let saved = false;
      await write.run(
        async (t, opts) => {
          const r = await measureLamp(api, t, { id: lamp.id, input }, opts);
          saved = r.ok;
          return r;
        },
        `Messung für „${lamp.name}“ gesichert.`,
        // An append (a measurement is added to the lamp): the operation and the local day, the values are the body (US-QS-03).
        appendKey("lamp", lamp.id, `measure:${localToday(new Date(), currentTimeZone())}`),
      );
      return saved;
    },
    onData: (lamp, data) =>
      void write.run(
        (t, opts) => describeLamp(api, t, { id: lamp.id, ...data }, opts),
        `Herstellerangabe für „${lamp.name}“ gesichert.`,
        // Set-state on the manufacturer's statement (a whole form): the operation only (US-QS-03).
        entityKey("lamp", lamp.id, "data"),
      ),
    onLimit: (percent) =>
      void write.run(
        (t, opts) => setDeviationLimit(api, t, percent, opts),
        percent === null ? "Die Prüfung ist aus." : `Grenze von ${percent} % gesichert.`,
        accountKey(`limit:${percent}`),
      ),
  };
}
