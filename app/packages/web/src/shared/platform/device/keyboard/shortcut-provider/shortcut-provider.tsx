import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useLocation, useNavigate } from "react-router";
import type { KeyboardShortcutMode } from "@pflanzendex/core";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./shortcut-provider.de.json";
import { isTextTarget, matchesShortcut, SHORTCUT_MODE } from "../keys";
import { KEY_OF, REGISTER, type ShortcutId } from "../register";

const t = texts(table);

/** The German label of each shortcut, from the message table; the overview and the tests read these. */
const LABEL_KEY = {
  overview: "shortcut.overview",
  search: "shortcut.search",
  today: "shortcut.today",
  collection: "shortcut.collection",
  species: "shortcut.species",
  wishlist: "shortcut.wishlist",
} as const satisfies Record<ShortcutId, keyof typeof table>;

/** The key of a control: what the person reads (`visible`) and what assistive technology reads (`aria`). */
export type KeyHint = { visible: string; aria: string };

/** One row of the overview: the keys as the mode shows them and the German name of the action. */
export type ShortcutRow = { id: ShortcutId; keys: string; label: string };

/** The addresses the navigating shortcuts lead to; the app frame supplies them (the register knows none). */
export type ShortcutTargets = Readonly<Record<Exclude<ShortcutId, "overview">, string>>;

/** The hint of a shortcut in a mode; `undefined` when the mode is off or not known yet. */
export function hintOf(
  id: ShortcutId,
  mode: KeyboardShortcutMode | undefined,
): KeyHint | undefined {
  if (mode === undefined || mode === SHORTCUT_MODE.disabled) return undefined;
  const key = KEY_OF[id];
  if (mode === SHORTCUT_MODE.plain) return { visible: key, aria: key };
  const shown = key.toUpperCase();
  return { visible: t("key.modifier", { key: shown }), aria: `Alt+Shift+${shown}` };
}

type ShortcutContextValue = {
  /** The mode of the account; `undefined` until the setting is known (then no shortcut fires). */
  mode: KeyboardShortcutMode | undefined;
  /** The rows of the overview, the keys as the mode shows them. */
  rows: readonly ShortcutRow[];
  hint: (id: ShortcutId) => KeyHint | undefined;
  overviewOpen: boolean;
  /** Opens the overview; `opener` is the control that opens it, else what has the focus now (US-QS-08). */
  openOverview: (opener?: HTMLElement | null) => void;
  /** The control that had the focus when the overview opened: the overview returns the focus there (US-QS-08). */
  overviewOpener: RefObject<HTMLElement | null>;
  setOverviewOpen: (open: boolean) => void;
  /** Takes a new mode at once, after the setting was saved (the settings page calls it). */
  setMode: (mode: KeyboardShortcutMode) => void;
};

const NONE: ShortcutContextValue = {
  mode: undefined,
  rows: [],
  hint: () => undefined,
  overviewOpen: false,
  openOverview: () => undefined,
  overviewOpener: { current: null },
  setOverviewOpen: () => undefined,
  setMode: () => undefined,
};

const ShortcutContext = createContext<ShortcutContextValue>(NONE);

/** The shortcut state of the app: the mode, the hints of the controls and the overview (US-QS-11). Without a provider nothing fires. */
export function useShortcuts(): ShortcutContextValue {
  return useContext(ShortcutContext);
}

const searchField = () =>
  document.querySelector<HTMLInputElement>('main input[type="search"]:not(:disabled)');

/** Focuses the search field of the view; the view may still be loading, so it waits a little (about two seconds). */
function focusSearchWhenThere(tries: number): void {
  const field = searchField();
  if (field) {
    field.focus();
    return;
  }
  if (tries > 0) window.setTimeout(() => focusSearchWhenThere(tries - 1), 50);
}

/** A dialog of another layer is open: its keys belong to it, so no shortcut fires behind it. */
const otherDialogOpen = () => document.querySelector('[role="dialog"][data-state="open"]') !== null;

/** The control that has the focus now, or `null` when the focus rests on `body` (no opener, US-QS-08). */
const focusedControl = (): HTMLElement | null => {
  const el = document.activeElement;
  return el instanceof HTMLElement && el !== document.body ? el : null;
};

/**
 * Opens the overview and remembers the control that opens it (US-QS-08). The control is read at the open, before the
 * open state changes: `?` has none, so the focus usually rests on `body` and the overview returns it to the start of the
 * view. Given an element (the help button), that element is the opener; a stray event is not.
 */
function useOverviewOpener(setOpen: (open: boolean) => void) {
  const overviewOpener = useRef<HTMLElement | null>(null);
  const openOverview = useCallback(
    (opener?: HTMLElement | null) => {
      overviewOpener.current = opener instanceof HTMLElement ? opener : focusedControl();
      setOpen(true);
    },
    [setOpen],
  );
  return useMemo(() => ({ openOverview, overviewOpener }), [openOverview]);
}

/**
 * Holds the mode, listens for the keys of the register and runs their actions (US-QS-11, DS-70). A key press in a text
 * field, in an editable area or in an open dialog never fires; `?` opens the overview, `/` focuses the search of the view
 * (or opens the catalog), the others navigate to their target. Each action is also a visible control elsewhere, so
 * nothing depends on the keys (US-QS-11).
 */
export function ShortcutProvider(props: {
  mode: KeyboardShortcutMode | undefined;
  targets: ShortcutTargets;
  children: ReactNode;
}) {
  const { targets } = props;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [mode, setMode] = useState(props.mode);
  useEffect(() => setMode(props.mode), [props.mode]);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const overview = useOverviewOpener(setOverviewOpen);
  // A change of the page closes the overview, also while its window is still loading (US-QS-07): the overview lives in
  // the app shell and would otherwise open on the new page. It is adjusted while rendering, so the old overview is not
  // painted on the new page. A change of the search parameters alone keeps it open.
  const [shownPath, setShownPath] = useState(pathname);
  if (pathname !== shownPath) {
    setShownPath(pathname);
    setOverviewOpen(false);
  }

  useEffect(() => {
    if (mode === undefined || mode === SHORTCUT_MODE.disabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || overviewOpen || isTextTarget(event.target)) return;
      if (otherDialogOpen()) return;
      const spec = REGISTER.find((s) => matchesShortcut(event, s, mode));
      if (!spec) return;
      event.preventDefault();
      if (spec.id === "overview") {
        overview.openOverview();
      } else if (spec.id === "search") {
        if (!searchField()) navigate(targets.search, { state: { keepFocus: true } });
        focusSearchWhenThere(40);
      } else {
        navigate(targets[spec.id]);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mode, overviewOpen, navigate, targets, overview]);

  const hint = useCallback((id: ShortcutId) => hintOf(id, mode), [mode]);
  const rows = useMemo<readonly ShortcutRow[]>(
    () =>
      REGISTER.map((s) => ({
        id: s.id,
        keys: hintOf(s.id, mode)?.visible ?? s.key,
        label: t(LABEL_KEY[s.id]),
      })),
    [mode],
  );
  const value = useMemo<ShortcutContextValue>(
    () => ({ mode, rows, hint, overviewOpen, setOverviewOpen, setMode, ...overview }),
    [mode, rows, hint, overviewOpen, overview],
  );
  return <ShortcutContext.Provider value={value}>{props.children}</ShortcutContext.Provider>;
}
