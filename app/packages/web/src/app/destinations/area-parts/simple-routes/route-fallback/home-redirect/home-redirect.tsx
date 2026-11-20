import { Navigate } from "react-router";
import { PATHS } from "@/shared/patterns/navigation/navigation/navigation";
import { TodaySkeleton } from "@/today";

/**
 * "/" leads to "Heute" (US-QS-16). A `Navigate` alone renders nothing, so the frame was empty until the redirect ran; the
 * skeleton of "Heute" holds it meanwhile, with its title where the page puts it (issue 2230).
 */
export function HomeRedirect() {
  return (
    <>
      <TodaySkeleton />
      <Navigate to={PATHS.today} replace />
    </>
  );
}
