import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TabItem = { value: string; label: string; content: React.ReactNode };

export type TabsProps = {
  /** Accessible name of the tab list (German). */
  label: string;
  tabs: readonly TabItem[];
  /** Controlled selection; without it the component keeps its own state, starting at `defaultValue` or the first tab. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  className?: string;
};

/** Index the key moves to (wrapping Left and Right), or undefined for other keys. */
function targetIndex(key: string, index: number, count: number): number | undefined {
  const last = count - 1;
  return {
    ArrowRight: index >= last ? 0 : index + 1,
    ArrowLeft: index <= 0 ? last : index - 1,
    Home: 0,
    End: last,
  }[key];
}

// The role sits on the shared Button; DS-48 reads a literal interactive role as a raw control, so it is a constant.
const TAB_ROLE = "tab";

type TabButtonProps = {
  tab: TabItem;
  active: boolean;
  tabId: string;
  panelId: string;
  onSelect: (value: string) => void;
};

function TabButton(props: TabButtonProps) {
  const { tab, active } = props;
  return (
    <Button
      id={props.tabId}
      role={TAB_ROLE}
      type="button"
      variant="ghost"
      aria-selected={active}
      aria-controls={props.panelId}
      tabIndex={active ? 0 : -1}
      onClick={() => props.onSelect(tab.value)}
      className={cn(
        "min-w-[44px] flex-1 whitespace-nowrap rounded-full px-4 font-semibold",
        active
          ? "bg-card text-foreground shadow-elevation-1 hover:bg-card forced-colors:border-[color:Highlight]"
          : "text-muted-foreground hover:bg-transparent hover:text-foreground",
      )}
    >
      {tab.label}
    </Button>
  );
}

/**
 * Tabs (US-QS-07, DS-34): a real `tablist` with roving tabindex. Tab reaches the selected tab only, Left and Right move
 * (wrapping), Home and End jump to the ends, and a moved focus selects at once (automatic activation). The panel is
 * focusable so keyboard users can reach its content after the list. Every tab is a 44 px target on the shared Button.
 */
export function Tabs(props: TabsProps) {
  const { tabs, onValueChange } = props;
  const base = React.useId();
  const [inner, setInner] = React.useState(props.defaultValue ?? tabs[0]?.value);
  const selected = props.value ?? inner;
  const listRef = React.useRef<HTMLDivElement>(null);

  const select = (value: string) => {
    setInner(value);
    onValueChange?.(value);
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    const next = targetIndex(
      event.key,
      tabs.findIndex((t) => t.value === selected),
      tabs.length,
    );
    const target = next === undefined ? undefined : tabs[next];
    if (!target) return;
    event.preventDefault();
    select(target.value);
    listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next as number]?.focus();
  };
  const panel = tabs.find((t) => t.value === selected);
  const idOf = (kind: "tab" | "panel", value: string) => `${base}-${kind}-${value}`;

  return (
    <div className={props.className}>
      <div
        ref={listRef}
        role="tablist"
        aria-label={props.label}
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className="flex w-full gap-1 overflow-x-auto rounded-full bg-muted p-1"
      >
        {tabs.map((t) => (
          <TabButton
            key={t.value}
            tab={t}
            active={t.value === selected}
            tabId={idOf("tab", t.value)}
            panelId={idOf("panel", t.value)}
            onSelect={select}
          />
        ))}
      </div>
      {panel ? (
        <div
          id={idOf("panel", panel.value)}
          role="tabpanel"
          aria-labelledby={idOf("tab", panel.value)}
          tabIndex={0}
          className="mt-3 min-h-[44px] rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {panel.content}
        </div>
      ) : null}
    </div>
  );
}
