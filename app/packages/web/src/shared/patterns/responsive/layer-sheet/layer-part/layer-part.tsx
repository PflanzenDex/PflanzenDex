import * as React from "react";
import { LayerSheet, useLayer } from "../layer-sheet";
import { OpenRow } from "./layer-part.row";

/**
 * A row of a list that opens its layer (US-QS-15, US-QS-17): the name, one line of value or help and a chevron. The whole
 * row is the hit area (44 px and more); the layer it opens is `?sheet=<id>`.
 */
export function LayerOpenRow({
  id,
  title,
  value,
  className,
}: {
  id: string;
  title: string;
  value?: React.ReactNode;
  className?: string;
}) {
  const { open, openLayer } = useLayer(id);
  return (
    <OpenRow
      title={title}
      {...(value === undefined ? {} : { value })}
      {...(className === undefined ? {} : { className })}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={(event) => openLayer(event.currentTarget)}
    />
  );
}

/**
 * A row and its layer (US-QS-17): the row sits in the list; the layer opens in the pane of the surrounding `LayerHost`
 * from 1024 px and above the screen below that. A closed layer renders nothing and loads nothing. `opener` replaces the
 * row with the caller's own control that opens the layer (it calls `openLayer` of `useLayer(id)`), for a control whose
 * look is not a row (SG-BTN-03).
 */
export function LayerPart({
  id,
  title,
  value,
  opener,
  primaryAction,
  children,
}: {
  id: string;
  title: string;
  value?: React.ReactNode;
  opener?: React.ReactNode;
  primaryAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      {opener ?? <LayerOpenRow id={id} title={title} value={value} />}
      <LayerSheet id={id} title={title} primaryAction={primaryAction}>
        {children}
      </LayerSheet>
    </>
  );
}
