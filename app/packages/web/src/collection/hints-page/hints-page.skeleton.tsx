import { Skeleton, SkeletonGroup } from "@/components/ui/display/skeleton/skeleton";
import { CARD, GRID } from "../parts";

/** Placeholder with the layout of the hints on a phone: title, intro and two hint cards with their button (DS-52, DS-53). */
export function HintsPageSkeleton({ label, host = false }: { label: string; host?: boolean }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-3">
      {!host && <Skeleton className="h-8 w-1/3" />}
      <Skeleton className="h-10 w-full" />
      <ul className={GRID}>
        {[0, 1].map((i) => (
          <li key={i} aria-hidden="true" className={CARD}>
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="mt-3 h-11 w-full" />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}
