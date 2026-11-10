import { Button } from "@/shared/ui/button/button";
import { texts } from "@/shared/lib/text-rules/texts";
import { useSay } from "@/shared/patterns/states/toast/toast-provider/toast-provider";
import { useInvalidate, useWriteAction } from "../../../shared/data";
import { markWatered } from "../../api/reminders-api";
import table from "./water-action.de.json";

const t = texts(table);

/**
 * "Gießen" for one plant (US-MON-05, US-QS-23): writes today's entry through the same operation as the list on "Heute".
 * The result is a toast (P-09, P-10): nothing is inserted below the button, so the layer does not move (DS-54).
 */
export function WaterAction(props: {
  api: string;
  token: () => Promise<string | undefined>;
  specimen: { id: string; name: string };
}) {
  const { api, token, specimen } = props;
  const say = useSay();
  const write = useWriteAction(token, useInvalidate(["monitoring", "watering"]), say);
  return (
    <Button
      type="button"
      variant="outline"
      disabled={write.running}
      aria-label={t("label", { name: specimen.name })}
      onClick={() =>
        void write.run(
          (tok) => markWatered(api, tok, [specimen.id]),
          t("watered", { name: specimen.name }),
        )
      }
    >
      {t("action")}
    </Button>
  );
}
