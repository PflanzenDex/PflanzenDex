import * as React from "react";

/**
 * What the container of a form tells its `FormBar` (US-QS-32, SG-SHEET-04, owner decisions d-060 and d-115): where the bar
 * goes and how the form is left. Every container of a layer has a bar of its own outside its scroll region, so the confirming
 * action is always in view: a phone sheet draws the pair into its bar above the title (and its close X gives way to
 * "Abbrechen"), a dialog from `md` and a pane from `lg` into a bar pinned at their bottom, under the scroll region
 * (`PinnedBar`). Without a host (a page) the form's `FormBarRegion` decides: the bar sticks at the top of the form below `md`
 * and is a plain row after the last field from `md`.
 */
export type FormBarHost = {
  /** The element of the container's bar; `null` until the container has mounted it (nothing is drawn before). */
  slot: HTMLElement | null;
  /** The close of the container; "Abbrechen" calls it, so the guard of a layer still asks for unsaved input. */
  close: () => void;
  /** Tells a phone sheet that its form has bar actions (its X leaves); returns the way to take that back. A dialog and a pane keep their close control and ignore it. */
  register: () => () => void;
};

export const FormBarHostContext = React.createContext<FormBarHost | null>(null);

/** The host of the container the form is in; `null` on a page. */
export function useFormBarHost(): FormBarHost | null {
  return React.useContext(FormBarHostContext);
}

const noRegister = () => () => undefined;

/**
 * The host of a pane (US-QS-32, owner decision d-115): the pair goes into the bar pinned at the bottom of the pane, and
 * "Abbrechen" closes through the guard of the layer. Gives the host and the callback that hands the pane's bar element to it.
 */
export function usePinnedBarHost(close: () => void) {
  const [slot, setSlot] = React.useState<HTMLElement | null>(null);
  const host = React.useMemo<FormBarHost>(
    () => ({ slot, close, register: noRegister }),
    [slot, close],
  );
  return { host, setSlot };
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
 * What the forms inside a `ResponsiveModal` learn about its bar (US-QS-32, SG-SHEET-04, owner decision d-115): below `md` the
 * bar of the sheet above its title, from `md` the bar pinned at the bottom of the dialog. Both containers hand their element
 * to `setSlot` (only one is mounted at a time), so the pair moves with the window and the form keeps its input. `close` is
 * the modal's own close, so "Abbrechen" goes the way of the X and the scrim, and a guarded layer asks for typed input first.
 * `sheetBar` is what the containers are given: the sheet also reads whether a form has bar actions (`active`, its X leaves).
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
    () => ({ slot, close: stable, register: isMd ? noRegister : register }),
    [isMd, slot, stable, register],
  );
  return { barHost, sheetBar };
}
