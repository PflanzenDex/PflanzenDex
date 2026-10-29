import { Button } from "@/components/ui/button/button";
import { errorText } from "@/lib/error-text";
import { useInvalidate, useWriteAction } from "../../../kernel";
import { markWatered } from "../../api/reminders-api";

/**
 * "Gießen" for one plant (US-MON-05, US-QS-23): writes today's entry through the same operation as the list on "Heute",
 * and says what was entered or why it failed (P-09, P-10).
 */
export function WaterAction(props: {
  api: string;
  token: () => Promise<string | undefined>;
  specimen: { id: string; name: string };
}) {
  const { api, token, specimen } = props;
  const write = useWriteAction(token, useInvalidate(["monitoring", "watering"]));
  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={write.running}
        aria-label={`Gießen: ${specimen.name}`}
        onClick={() =>
          void write.run(
            (t) => markWatered(api, t, [specimen.id]),
            `„${specimen.name}“ als gegossen eingetragen.`,
          )
        }
      >
        Gießen
      </Button>
      {write.message ? (
        <p role="status" className="col-span-2 text-sm">
          {write.message}
        </p>
      ) : null}
      {write.error ? (
        <p role="alert" className="col-span-2 rounded-lg border border-destructive p-2 text-sm">
          {errorText(write.error.code)}
        </p>
      ) : null}
    </>
  );
}
