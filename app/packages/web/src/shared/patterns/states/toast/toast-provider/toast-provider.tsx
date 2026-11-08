import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ToastItem,
  type ToastAction,
  type ToastData,
  type ToastKind,
} from "../toast-item/toast-item";

export type ToastOptions = {
  message: string;
  /** `success` (default) is read politely, `error` at once and stays longer. */
  kind?: ToastKind;
  /** Optional undo or follow-up action; taking it closes the toast. */
  action?: ToastAction;
  duration?: number;
};

export type ToastApi = {
  show: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
};

const MAX_VISIBLE = 3; // more wait in line, none is dropped (P-10)

const Context = createContext<ToastApi | null>(null);

/** Shows a toast after a write (US-QS-07). Needs a `ToastProvider` above; there is no silent fallback (P-10). */
export function useToast(): ToastApi {
  const api = useContext(Context);
  if (!api) throw new Error("useToast needs a ToastProvider");
  return api;
}

/** Says a result as a toast: `success` (default) is read politely, `error` at once. */
export type Say = (message: string, kind?: ToastKind) => void;

/**
 * The result of a write as a toast (US-QS-07, DS-54): a confirmation appears over the page and inserts nothing above the
 * content. The function is stable, so it can be passed to a write hook.
 */
export function useSay(): Say {
  const toast = useToast();
  return useCallback(
    (message, kind) => {
      toast.show(kind ? { message, kind } : { message });
    },
    [toast],
  );
}

/**
 * Owns the toast queue and the viewport (US-QS-07). Both live regions (plain `aria-live`, no role, so an empty region never counts as an alert or status) exist before the first toast, because a screen
 * reader only notices changes in a region it already knows: confirmations in the polite one, errors in the assertive
 * one. The viewport stacks above the bottom bar on a phone and sits bottom right from `md`; it lies above an open layer
 * (its overlay and drawer are `z-50`), so an undo offered there can be seen and taken (US-QS-07, issue 1028).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const next = useRef(1);
  const api = useMemo<ToastApi>(
    () => ({
      show: ({ kind = "success", ...rest }) => {
        const id = next.current++;
        setToasts((list) => [...list, { id, kind, ...rest }]);
        return id;
      },
      dismiss: (id) => setToasts((list) => list.filter((toast) => toast.id !== id)),
    }),
    [],
  );
  const visible = toasts.slice(0, MAX_VISIBLE);
  const render = (kind: ToastKind) =>
    visible
      .filter((toast) => toast.kind === kind)
      .map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => api.dismiss(toast.id)} />
      ));
  return (
    <Context.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 tall-window:bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)] z-[60] flex flex-col gap-2 md:inset-x-auto md:bottom-6 tall-window:md:bottom-6 md:right-[max(1.5rem,calc((100vw-120rem)/2+1.5rem))] md:w-96">
        <div aria-live="polite" className="flex flex-col gap-2">
          {render("success")}
        </div>
        <div aria-live="assertive" className="flex flex-col gap-2">
          {render("error")}
        </div>
      </div>
    </Context.Provider>
  );
}
