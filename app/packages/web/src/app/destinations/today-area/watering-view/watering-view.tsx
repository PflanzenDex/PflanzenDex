import { Suspense } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { WateringList, WateringListSkeleton } from "@/monitoring";
import { TodayFilter, WATERING_TASKS, taskFilterOf, todayTexts } from "@/today";
import { texts } from "@/shared/lib/text-rules/texts";
import { PATHS } from "@/shared/patterns/navigation/navigation/navigation";

type Token = () => Promise<string | undefined>;

const t = texts(todayTexts);

/** Whether the address narrows "Heute" to the watering tasks (`?tasks=watering`, US-QS-26). */
export function useWateringFilter(): boolean {
  const [params] = useSearchParams();
  return taskFilterOf(params) === WATERING_TASKS;
}

/**
 * "Heute" narrowed to the watering tasks (`?tasks=watering`, US-QS-26): the page with its notice and the one control that
 * clears the filter, and today's watering list (US-MON-05) in place of the overview. The list shows its own skeleton while
 * it loads (US-QS-14).
 */
export function WateringView(props: { api: string; token: Token }) {
  const navigate = useNavigate();
  return (
    <TodayFilter onClear={() => void navigate(PATHS.today)}>
      <Suspense fallback={<WateringListSkeleton label={t("page.loading")} />}>
        <WateringList api={props.api} token={props.token} />
      </Suspense>
    </TodayFilter>
  );
}
