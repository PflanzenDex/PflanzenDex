import { useEffect, useRef } from "react";
import type { AccountSection } from "@/shared/patterns/navigation/navigation/navigation";
import { rowId } from "./account-model";

/** Back to the index puts the focus on the row the keeper came from (US-QS-17). */
export function useReturnFocus(chosen: AccountSection | undefined) {
  const came = useRef<AccountSection | null>(null);
  useEffect(() => {
    if (chosen) {
      came.current = chosen;
      return;
    }
    if (came.current) document.getElementById(rowId(came.current))?.focus();
    came.current = null;
  }, [chosen]);
}
