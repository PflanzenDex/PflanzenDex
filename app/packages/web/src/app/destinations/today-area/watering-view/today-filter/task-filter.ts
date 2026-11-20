import { PATHS } from "@/shared/patterns/navigation/navigation/navigation";

/** The query parameter of "Heute" that narrows the day to one kind of task (US-QS-26). */
const TASKS_PARAM = "tasks";
/** The kind of task the filter narrows to: the watering of today (US-MON-05). */
export const WATERING_TASKS = "watering";
type TaskFilter = typeof WATERING_TASKS;

/** The shortcut "Gießen" of the installed app opens "Heute" with the watering tasks only (US-QS-26). */
export const WATERING_TASKS_ADDRESS = `${PATHS.today}?${TASKS_PARAM}=${WATERING_TASKS}`;

/**
 * The filter an address names: `?tasks=watering` narrows "Heute" to the watering tasks (US-QS-26). Any other value, or a
 * missing parameter, shows the whole day, so an unknown address never hides a task.
 */
export function taskFilterOf(params: URLSearchParams): TaskFilter | undefined {
  return params.get(TASKS_PARAM) === WATERING_TASKS ? WATERING_TASKS : undefined;
}
