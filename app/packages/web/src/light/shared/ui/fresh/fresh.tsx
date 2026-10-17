import { useRef, type ReactNode } from "react";

/** Disclosure that holds a create form; `openAndFocus` is the next action of an empty list (P-09). */
export function useFresh() {
  const ref = useRef<HTMLDetailsElement>(null);
  const openAndFocus = () => {
    const el = ref.current;
    if (!el) return;
    el.open = true;
    el.querySelector<HTMLElement>("input, select")?.focus();
  };
  return { ref, openAndFocus };
}

export function Fresh(props: {
  title: string;
  open?: boolean;
  fresh: ReturnType<typeof useFresh>;
  children: ReactNode;
}) {
  return (
    <details
      ref={props.fresh.ref}
      open={props.open ?? false}
      className="mt-4 min-w-0 rounded-lg border border-dashed border-border px-4 pb-4"
    >
      <summary className="flex min-h-[44px] cursor-pointer items-center rounded-md font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {props.title}
      </summary>
      <div className="pt-2">{props.children}</div>
    </details>
  );
}
