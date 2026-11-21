import { render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { Link, MemoryRouter } from "react-router";
import { expect } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { BRAND_HREF, DISPLAY_NAME, brandLink, topBar } from "../../nav-item";
import { BRAND_LINK_LABEL } from "../../navigation/navigation";
import { AppBarSlotProvider, useAppBarSlot } from "./app-bar-slot";

/** The top bar of the shell, as `GlobalHeader` draws it: the brand while no page claims the bar, and the slot a header goes into. */
function TopBar() {
  const bar = useAppBarSlot();
  return (
    <header className={topBar}>
      {bar?.claimed ? null : (
        <Link to={BRAND_HREF} aria-label={BRAND_LINK_LABEL} className={brandLink}>
          {DISPLAY_NAME}
        </Link>
      )}
      <div data-app-bar-slot="" ref={bar?.setElement} />
    </header>
  );
}

/**
 * Renders `page` on a phone (below `md`) in a shell with a top bar, at `entry` (US-QS-32, SG-HEAD-01): a header of the page
 * goes into the bar, as it does in the app. A test of one page calls `expectTitleInBar` after it.
 */
export function renderInTopBar(page: ReactElement, entry = "/") {
  setViewportWidth(360);
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AppBarSlotProvider>
        <TopBar />
        <main>{page}</main>
      </AppBarSlotProvider>
    </MemoryRouter>,
  );
}

/**
 * SG-HEAD-01 and SG-HEAD-02: below `md` the page has exactly one h1, it is the title the page names, it stands in the top bar,
 * and the brand is not shown there. A sub-page names the target of its back control (`back`, SG-HEAD-04).
 */
export function expectTitleInBar(title: string | RegExp, back?: string): void {
  const headings = screen.getAllByRole("heading", { level: 1 });
  expect(headings).toHaveLength(1);
  const h1 = headings[0] as HTMLElement;
  expect(h1.textContent).toMatch(title);
  const bar = document.querySelector<HTMLElement>("[data-app-bar-slot]");
  expect(bar?.contains(h1)).toBe(true);
  expect(screen.queryByRole("link", { name: BRAND_LINK_LABEL })).toBeNull();
  if (back !== undefined) {
    const inBar = within(bar as HTMLElement);
    // The way back is a link to an address, or a button for a way back inside one view.
    expect(
      inBar.queryByRole("link", { name: back }) ?? inBar.queryByRole("button", { name: back }),
    ).not.toBeNull();
  }
}
