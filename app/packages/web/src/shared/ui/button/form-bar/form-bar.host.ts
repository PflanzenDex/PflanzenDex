import * as React from "react";

/**
 * What the container of a form tells its `FormBar` (US-QS-32, SG-SHEET-04): where the bar goes and how the form is left.
 * A phone sheet (`sheet`) has a bar of its own above the scroll region; the pair is drawn into its `slot` and the sheet's
 * close X gives way to "Abbrechen". A dialog from `md` and a pane from `lg` have no slot: the pair is a plain row in the
 * content. Without a host (a page) the bar is drawn in place and sticky.
 */
export type FormBarHost = {
  /** A phone sheet: the pair goes through a portal into `slot`, and nothing is drawn until the sheet has its slot. */
  sheet: boolean;
  slot: HTMLElement | null;
  /** The close of the container; "Abbrechen" calls it, so the guard of a layer still asks for unsaved input. */
  close: () => void;
  /** Tells the sheet that its form has bar actions (its X leaves); returns the way to take that back. */
  register: () => () => void;
};

export const FormBarHostContext = React.createContext<FormBarHost | null>(null);

/** The host of the container the form is in; `null` on a page. */
export function useFormBarHost(): FormBarHost | null {
  return React.useContext(FormBarHostContext);
}

const noRegister = () => () => undefined;

/** A dialog or pane (from `md`): the pair is a plain row in the content, closing with the container's close. */
export function rowHost(close: () => void): FormBarHost {
  return { sheet: false, slot: null, close, register: noRegister };
}

/**
 * The bar of a phone sheet: its `slot` (set by the sheet panel once it has mounted it) and how many forms have bar actions.
 * `active` is what the sheet reads to swap its X for "Abbrechen"; `register` is what each `FormBar` calls.
 */
export function useSheetBar() {
  const [slot, setSlot] = React.useState<HTMLElement | null>(null);
  const [count, setCount] = React.useState(0);
  const register = React.useCallback(() => {
    setCount((n) => n + 1);
    return () => setCount((n) => n - 1);
  }, []);
  return { slot, setSlot, active: count > 0, register };
}

/**
 * What the forms inside a `ResponsiveModal` learn about its bar (US-QS-32, SG-SHEET-04): below `md` the bar of the sheet,
 * from `md` a plain row of the dialog. `close` is the modal's own close, so "Abbrechen" goes the way of the X and the scrim,
 * and a guarded layer asks for typed input first. `sheetBar` is what the sheet panel is given.
 */
export function useModalBarHost(isMd: boolean, close: () => void) {
  const sheetBar = useSheetBar();
  const latest = React.useRef(close);
  React.useLayoutEffect(() => {
    latest.current = close;
  });
  const stable = React.useCallback(() => latest.current(), []);
  const { slot, register } = sheetBar;
  const barHost = React.useMemo<FormBarHost>(
    () => (isMd ? rowHost(stable) : { sheet: true, slot, close: stable, register }),
    [isMd, slot, stable, register],
  );
  return { barHost, sheetBar };
}
