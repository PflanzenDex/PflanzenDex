import type { ReactNode } from "react";
import { LayerSheet, useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";

/**
 * A layer whose content exists only while it is open: `LayerSheet` keeps its children mounted below the pane width, and a
 * closed layer must neither load its data nor write the address (several lists once shared it).
 */
export function Layer(props: {
  id: string;
  title: string;
  /** Opens at half height at least below 768 px (US-QS-15, owner decision 2026-11-22, issue 2424): the news list. */
  halfHeight?: boolean;
  children: ReactNode;
}) {
  const { open } = useLayer(props.id);
  return (
    <LayerSheet id={props.id} title={props.title} halfHeight={props.halfHeight === true}>
      {open ? props.children : null}
    </LayerSheet>
  );
}
