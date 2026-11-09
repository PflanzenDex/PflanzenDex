import type { ReactNode } from "react";
import { Button } from "@/shared/ui/button/button";

/**
 * The sticky footer of the measure form (US-QS-15): the one filled action stays in view while the page is longer than the
 * screen. While the photo is stored (US-WAC-06) `photoStatus` says so above the button. The status line is always in the
 * DOM, so a status that appears is announced; empty, it takes no room. The button is disabled while the write runs.
 */
export function SaveFooter(props: {
  formId: string;
  pending: boolean;
  photoStatus: string | null;
  children: ReactNode;
}) {
  return (
    <div className="sticky bottom-0 z-10 bg-background py-1">
      <p role="status" className="text-sm text-muted-foreground empty:hidden">
        {props.photoStatus}
      </p>
      <Button
        type="submit"
        form={props.formId}
        size="touch"
        className="w-full"
        disabled={props.pending}
      >
        {props.children}
      </Button>
    </div>
  );
}
