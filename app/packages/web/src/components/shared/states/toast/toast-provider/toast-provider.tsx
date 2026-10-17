import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
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

/**
 * Owns the toast queue and the viewport (US-QS-07). Both live regions (plain `aria-live`, no role, so an empty region never counts as an alert or status) exist before the first toast, because a screen
 * reader only notices changes in a region it already knows: confirmations in the polite one, errors in the assertive
 * one. The viewport stacks above the bottom bar on a phone and sits bottom right from `md`.
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
      <div className="pointer-events-none fixed inset-x-4 bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)] z-50 flex flex-col gap-2 md:inset-x-auto md:bottom-6 md:right-6 md:w-96">
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
