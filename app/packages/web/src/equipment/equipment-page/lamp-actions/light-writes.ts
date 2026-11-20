import { accountKey, entityKey, useWriteAction } from "../../../shared/data";
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
        `Messung für „${lamp.name}“ gespeichert.`,
        entityKey("lamp", lamp.id, `measure:${JSON.stringify(input)}`),
      );
      return saved;
    },
    onData: (lamp, data) =>
      void write.run(
        (t, opts) => describeLamp(api, t, { id: lamp.id, ...data }, opts),
        `Herstellerangabe für „${lamp.name}“ gespeichert.`,
        entityKey("lamp", lamp.id, `data:${JSON.stringify(data)}`),
      ),
    onLimit: (percent) =>
      void write.run(
        (t, opts) => setDeviationLimit(api, t, percent, opts),
        percent === null ? "Die Prüfung ist aus." : `Grenze von ${percent} % gespeichert.`,
        accountKey(`limit:${percent}`),
      ),
  };
}
