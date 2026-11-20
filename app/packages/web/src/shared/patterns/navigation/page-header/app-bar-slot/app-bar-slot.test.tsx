// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { PageHeader } from "../page-header";
import { AppBarSlotProvider, useAppBarSlot } from "./app-bar-slot";

/** The element of the bar that takes the header's row, as the shell's GlobalHeader renders it. */
function Bar() {
  const bar = useAppBarSlot();
  return <div data-app-bar-slot="" ref={bar?.setElement} />;
}

function shell(children: ReactNode) {
  return (
    <MemoryRouter>
      <AppBarSlotProvider>
        <Bar />
        {children}
      </AppBarSlotProvider>
    </MemoryRouter>
  );
}

const bar = () => document.querySelector<HTMLElement>("[data-app-bar-slot]");
const barTitles = () => Array.from(bar()?.querySelectorAll("h1") ?? [], (h) => h.textContent);

afterEach(cleanup);
beforeEach(() => setViewportWidth(360));

describe("US-QS-32 the top bar shows one title while several page headers are mounted (issue 2230)", () => {
  it("US-QS-32 · a skeleton header and the page header of Heute do not both show in the bar", () => {
    // The skeleton of the area stays mounted while the page's own header is there (hidden parts keep their portals).
    render(
      shell(
        <>
          <PageHeader fallback title="Heute" />
          <PageHeader headingId="today-title" title="Heute" />
        </>,
      ),
    );
    expect(barTitles()).toEqual(["Heute"]);
    expect(document.querySelectorAll("h1")).toHaveLength(1);
  });

  it("US-QS-32 · the first header that mounted holds the bar, the next one takes it when that one leaves", () => {
    const { rerender } = render(
      shell(
        <>
          <PageHeader title="Sammlung" />
          <PageHeader title="Heute" />
        </>,
      ),
    );
    expect(barTitles()).toEqual(["Sammlung"]);
    rerender(shell(<PageHeader title="Heute" />));
    expect(barTitles()).toEqual(["Heute"]);
  });

  it("US-QS-32 · a header that does not hold the bar renders no heading below md", () => {
    render(
      shell(
        <>
          <PageHeader title="Heute" />
          <PageHeader title="Heute" />
        </>,
      ),
    );
    expect(document.querySelectorAll("h1")).toHaveLength(1);
  });
});
