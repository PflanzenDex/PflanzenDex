import * as React from "react";

/**
 * Whether the component is inside a sheet or a dialog (US-QS-32, SG-LIST-01). On a phone a list on a page scrolls, but a list
 * in a layer keeps its pages: the layer is sized by the window, so the list pages by its free height (issue 1861 owns the
 * layers). The dialog and the sheet provide it for everything they hold, so no caller has to know whether it sits in one.
 */
export const LayerScope = React.createContext(false);

export const useInLayer = (): boolean => React.useContext(LayerScope);
