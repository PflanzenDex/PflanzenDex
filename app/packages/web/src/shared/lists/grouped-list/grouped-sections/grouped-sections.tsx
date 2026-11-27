import { useRef, type ReactNode } from "react";
import { ScrollRegion } from "@/shared/patterns/responsive/entry-list/paging/scroll-entries/scroll-region/scroll-region";
import { scrollToTop } from "@/shared/platform/device/motion/scroll-top";
import {
  countOf,
  GroupSection,
  SectionsContext,
  type SectionGroup,
  type SectionList,
} from "./group-section/group-section";
import { GroupJump, type GroupChoice } from "./group-jump/group-jump";
import { useStickyFit } from "./use-sticky-fit";

export type { SectionGroup, SectionList } from "./group-section/group-section";
export { GroupSection } from "./group-section/group-section";

/** The chip of a group (the name and the count) for the row that jumps. */
const choiceOf = (g: SectionGroup<unknown>): GroupChoice => ({
  key: g.key,
  label: g.label,
  count: countOf(g),
  ...(g.countText === undefined ? {} : { countText: g.countText }),
});

/** Scrolls the section of `key` to the top of its scroll region and moves the focus to its heading (SG-LIST-06). */
function jump(box: HTMLElement | null, key: string): void {
  const section = Array.from(box?.querySelectorAll<HTMLElement>("[data-group-key]") ?? []).find(
    (el) => el.dataset["groupKey"] === key,
  );
  const region = section?.closest<HTMLElement>("[data-scroll-region]");
  if (!section || !region) return;
  scrollToTop(region, section);
  // The heading takes the focus, so the next Tab is the first entry of the group and a screen reader names the group.
  const heading = section.querySelector<HTMLElement>("h2, h3, h4");
  heading?.setAttribute("tabindex", "-1");
  heading?.focus({ preventScroll: true });
}

/**
 * A grouped list: every group is a section of one scrolling list, with a real heading and its count (SG-LIST-06, SG-LIST-08;
 * owner decision 2026-11-22, issue 2419). The chips above jump to a section (tap: that section stands at the top of the
 * region); they are no filter and hide nothing. The headings are sticky while their group passes, one at a time, each pushed
 * out by the next (`useStickyFit`: not when a heading would cover more than a third of the region). On a page
 * (`in="page"`) the sections scroll in a region of their own under the chips; in a layer (`in="layer"`) the layer's body is
 * the region. A fixed set of groups lists every group, an empty one as its quiet line (`SectionGroup.empty`); an open set
 * lists only groups with entries; the group of an unknown value stands last (the callers order the groups). The last
 * section ends the whole list with "Das waren alle n" when every entry is there. `children` replace the sections of
 * `groups` where a group loads itself (the plants of a location); `groups` still name the chips.
 */
export function GroupSections<T>(props: {
  /** Accessible name of the scroll region of a page (German). */
  label: string;
  /**
   * Accessible name of the row that jumps (German), e.g. "Zum Standort springen". Without it there is no row: a short list of
   * two or three sections, such as the due items, needs none.
   */
  jumpLabel?: string;
  groups: readonly SectionGroup<T>[];
  list: SectionList<T>;
  /** The heading level of the groups: 2 below the page's h1, 3 or 4 inside a layer (SG-HEAD-03). */
  level?: 2 | 3 | 4;
  in?: "page" | "layer";
  /** `false` where the count of the entries is not what the headings count (the sections of an achievement group): no end marker. */
  endMarker?: boolean;
  children?: ReactNode;
}) {
  const { groups } = props;
  const surface = props.in ?? "page";
  const box = useRef<HTMLDivElement>(null);
  useStickyFit(box, groups.length);
  const total = groups.reduce((n, g) => n + countOf(g), 0);
  const shared = {
    list: props.list as SectionList<never>,
    level: props.level ?? 2,
    sticky: surface,
  };
  const sections = (
    <SectionsContext value={shared}>
      <div ref={box} data-sticky="on" className="group/sections flex min-w-0 flex-col gap-6">
        {props.children ??
          groups.map((g, i) => (
            <GroupSection
              key={g.key}
              group={g}
              end={props.endMarker !== false && i === groups.length - 1 ? total : false}
            />
          ))}
      </div>
    </SectionsContext>
  );
  const chips =
    groups.length > 1 && props.jumpLabel !== undefined ? (
      <GroupJump
        label={props.jumpLabel}
        choices={groups.map(choiceOf)}
        onJump={(key) => jump(box.current, key)}
      />
    ) : null;
  return surface === "page" ? (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      {chips}
      <ScrollRegion label={props.label} className="scroll-pt-12">
        {sections}
      </ScrollRegion>
    </div>
  ) : (
    <div className="flex min-w-0 flex-col gap-3">
      {chips}
      {sections}
    </div>
  );
}
