import { Button } from "@/shared/ui/button/button";
import { BUSY_LOOK } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import { useToast } from "@/shared/patterns/states/toast/toast-provider/toast-provider";
import { useInvalidate, useWriteAction } from "../../../shared/data";
import { markWatered } from "../../api/reminders-api";
import table from "./water-action.de.json";

const t = texts(table);

/**
 * "Gießen" for one plant (US-MON-05, US-QS-23): writes today's entry through the same operation as the list on "Heute".
 * The result is a toast (P-09, P-10), announced with it: the plant layer shows no watering in place yet, so the toast
 * stays until the in-place row of FX-09 (SG-FEED-03). Focus stays on the button (F-0094, US-QS-32): while the write runs
 * the button is `aria-disabled`, not `disabled`, because a disabled button that has the focus drops it to the body. The
 * busy guard of `useWriteAction` ignores a second press.
 */
export function WaterAction(props: {
  api: string;
  token: () => Promise<string | undefined>;
  specimen: { id: string; name: string };
}) {
  const { api, token, specimen } = props;
  const toast = useToast();
  const write = useWriteAction(
    token,
    useInvalidate(["monitoring", "watering"]),
    (message, kind) => {
      toast.show(kind ? { message, kind } : { message });
    },
  );
  return (
    <Button
      type="button"
      variant="outline"
      aria-disabled={write.running || undefined}
      className={BUSY_LOOK}
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
