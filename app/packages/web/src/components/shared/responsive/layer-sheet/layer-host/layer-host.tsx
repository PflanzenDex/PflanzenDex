import * as React from "react";
import { cn } from "@/lib/utils";

/** The pane column of a `LayerHost`: hidden while empty, so it adds no gap (US-QS-15, US-QS-18). */
const PANE_SLOT = "hidden lg:flex lg:shrink-0 lg:flex-col lg:self-start lg:empty:hidden";

/** The content column: at most 720 px and centred, so the pane beside it takes the rest (US-QS-18, #1027). */
const CONTENT_COLUMN = "mx-auto flex min-h-0 min-w-0 max-w-180 flex-1 flex-col";

type LayerHostState = { pane: HTMLDivElement | null } | null;
export const LayerHostContext = React.createContext<LayerHostState>(null);

export type LayerHostProps = Omit<React.HTMLAttributes<HTMLDivElement>, "children"> & {
  children: React.ReactNode;
  /**
   * Classes of the content column, e.g. its gap or its height; the frame itself takes `className`. A caller whose
   * content holds another frame may lift the cap of the content from 1024 px (`lg:max-w-none`), so the inner pane has room.
   */
  contentClassName?: string;
};

/**
 * The frame of a destination with layers (US-QS-15, DS-59): the content in one column of at most 720 px, centred in the
 * frame (US-QS-18, #1027); from 1024 px the pane of an open layer takes the second column beside it and the content gives
 * it its room. Every `LayerSheet` inside renders its pane here, in whatever component it sits, so a layer never stacks
 * below the list. Render one frame at the top of each destination: the pane then starts where the content starts and
 * reaches to the bottom of the viewport.
 */
export function LayerHost({ children, className, contentClassName, ...rest }: LayerHostProps) {
  const [pane, setPane] = React.useState<HTMLDivElement | null>(null);
  const value = React.useMemo(() => ({ pane }), [pane]);
  const frame = cn("flex min-w-0 flex-col lg:flex-row lg:gap-4", className);
  return (
    <LayerHostContext.Provider value={value}>
      <div data-layer-host="" {...rest} className={frame}>
        <div className={cn(CONTENT_COLUMN, contentClassName)}>{children}</div>
        <div ref={setPane} className={PANE_SLOT} />
      </div>
    </LayerHostContext.Provider>
  );
}
