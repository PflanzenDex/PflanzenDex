import * as React from "react";
import { Button } from "@/shared/ui/button/button";
import { cn } from "@/shared/lib/utils";

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
  /** Classes of the panel, e.g. to let it scroll inside a frame of fixed height (US-QS-21). */
  panelClassName?: string;
  /**
   * Breaks the tabs onto further lines when they do not fit (text at 200 %), instead of scrolling the list sideways
   * (US-QS-21: nothing scrolls horizontally). The default keeps one line and scrolls the list.
   */
  wrap?: boolean;
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

type TabButtonProps = {
  tab: TabItem;
  active: boolean;
  wrap: boolean;
  tabId: string;
  panelId: string;
  onSelect: (value: string) => void;
};

function TabButton(props: TabButtonProps) {
  const { tab, active, wrap } = props;
  return (
    <Button
      id={props.tabId}
      role="tab"
      type="button"
      variant="ghost"
      aria-selected={active}
      aria-controls={props.panelId}
      tabIndex={active ? 0 : -1}
      onClick={() => props.onSelect(tab.value)}
      className={cn(
        "flex-1 rounded-full font-semibold",
        // Wrap: a tab is never narrower than its label, so the label breaks inside the tab or the strip breaks onto
        // another line (NFR-13, text at 200 %). The narrower padding keeps the widest label at normal size within the
        // equal share of a 360 px phone, so the tabs stay equally wide there. Otherwise the label stays on one line in a
        // tab of at least 44 px.
        wrap
          ? "min-w-fit max-w-full whitespace-normal px-3"
          : "min-w-[44px] whitespace-nowrap px-4",
        active
          ? "bg-accent text-accent-foreground shadow-elevation-1 hover:bg-accent forced-colors:border-[color:Highlight]"
          : "text-muted-foreground hover:bg-transparent hover:text-foreground",
      )}
    >
      {tab.label}
    </Button>
  );
}

type TabPanelProps = {
  id: string;
  labelledBy: string;
  className?: string | undefined;
  children: React.ReactNode;
};

/** The focusable panel of the selected tab; `className` is the caller's (US-QS-21), the focus ring is ours. */
function TabPanel(props: TabPanelProps) {
  return (
    <div
      id={props.id}
      role="tabpanel"
      aria-labelledby={props.labelledBy}
      tabIndex={0}
      className={cn(
        "mt-3 min-h-[44px] rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        props.className,
      )}
    >
      {props.children}
    </div>
  );
}

/** The strip wraps, or stays one row that scrolls sideways; such a row is marked for the one-screen gate (issue 1183). */
function stripLayout(wrap: boolean | undefined) {
  return {
    "data-scroll-x": wrap ? undefined : "row",
    className: cn(
      "flex w-full gap-1 bg-muted p-1",
      wrap ? "flex-wrap rounded-2xl" : "overflow-x-auto rounded-full",
    ),
  };
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
        {...stripLayout(props.wrap)}
      >
        {tabs.map((t) => (
          <TabButton
            key={t.value}
            tab={t}
            active={t.value === selected}
            wrap={props.wrap ?? false}
            tabId={idOf("tab", t.value)}
            panelId={idOf("panel", t.value)}
            onSelect={select}
          />
        ))}
      </div>
      {panel ? (
        <TabPanel
          id={idOf("panel", panel.value)}
          labelledBy={idOf("tab", panel.value)}
          className={props.panelClassName}
        >
          {panel.content}
        </TabPanel>
      ) : null}
    </div>
  );
}
