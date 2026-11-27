import * as React from "react";

/**
 * Whether the component is inside a sheet, a dialog or a pane (US-QS-32, SG-LIST-01). A list in a layer is the content of the
 * layer: it never pages and takes no scroll box of its own, the layer scrolls under its title and its action (issue 2418).
 * The dialog, the sheet and the pane provide it for everything they hold, so no caller has to know whether it sits in one.
 */
export const LayerScope = React.createContext(false);

export const useInLayer = (): boolean => React.useContext(LayerScope);
