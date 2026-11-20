// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { AppBarSlotProvider, useAppBarSlot } from "../app-bar-slot/app-bar-slot";
import { PageHeader } from "../page-header";
import { PageTitle } from "./page-title";

function Bar() {
  const bar = useAppBarSlot();
  return <div data-app-bar-slot="" ref={bar?.setElement} />;
}

const shell = (children: ReactNode) => (
  <MemoryRouter>
    <AppBarSlotProvider>
      <Bar />
      {children}
    </AppBarSlotProvider>
  </MemoryRouter>
);

afterEach(cleanup);
beforeEach(() => setViewportWidth(360));

describe("US-QS-32 the title of a loading page (PageTitle, issue 2230)", () => {
  it("US-QS-32 · the title takes the top bar below md, with the row and title classes of the page header", () => {
    const title = render(shell(<PageTitle title="Heute" />));
    const bar = title.container.querySelector("[data-app-bar-slot]");
    const h1 = bar?.querySelector("h1");
    expect(h1?.textContent).toBe("Heute");
    expect(h1?.hasAttribute("data-route-fallback")).toBe(true);
    // The page's own header draws the same classes, so the row does not change when the page replaces the title.
    const page = render(shell(<PageHeader title="Heute" />));
    const pageBar = page.container.querySelector("[data-app-bar-slot]");
    expect(pageBar?.querySelector("[data-page-header]")?.className).toBe(
      bar?.querySelector("[data-page-header]")?.className,
    );
  });

  it("US-QS-32 · the title takes no place of its own without a bar: it is the one h1 in the content", () => {
    const { container } = render(
      <MemoryRouter>
        <PageTitle title="Heute" />
      </MemoryRouter>,
    );
    expect(container.querySelectorAll("h1")).toHaveLength(1);
  });

  it("US-QS-32 · from md the title is the content's h1 and the bar holds nothing", () => {
    setViewportWidth(1024);
    const { container } = render(shell(<PageTitle title="Heute" />));
    expect(container.querySelector("[data-app-bar-slot] h1")).toBeNull();
    expect(container.querySelector("main h1")).toBeNull();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
  });
});
