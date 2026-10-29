import type { ReactNode } from "react";
import { LayerSheet, useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";

/**
 * A layer whose content exists only while it is open: `LayerSheet` keeps its children mounted below the pane width, and a
 * closed layer must neither load its data nor page the address (several pagers share `?page=`).
 */
export function Layer(props: { id: string; title: string; children: ReactNode }) {
  const { open } = useLayer(props.id);
  return (
    <LayerSheet id={props.id} title={props.title}>
      {open ? props.children : null}
    </LayerSheet>
  );
}
