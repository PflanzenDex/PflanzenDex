// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { AppBarSlotProvider, useAppBarSlot } from "./app-bar-slot/app-bar-slot";
import { PageHeader, type PageActions } from "./page-header";

/** Renders inside a router, because the back control of a page is a link to its address. */
const inRouter = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

/** The top bar of the shell in miniature: the slot element a page header goes into (the real one is GlobalHeader). */
function TestBar() {
  const bar = useAppBarSlot();
  return (
    <header>
      {bar?.claimed ? null : <span>Marke</span>}
      <div data-app-bar-slot="" ref={bar?.setElement} />
    </header>
  );
}

/** A shell with a bar and a content region, as AppShell lays them out: the bar first, the page in `main`. */
function InShell(props: { children: ReactElement }) {
  return (
    <MemoryRouter>
      <AppBarSlotProvider>
        <TestBar />
        <main>{props.children}</main>
      </AppBarSlotProvider>
    </MemoryRouter>
  );
}

afterEach(cleanup);
beforeEach(() => setViewportWidth(360));

describe("US-QS-14 · US-QS-15 PageHeader, the one header of a sub-page", () => {
  it("US-QS-14 renders the title as the one h1 of the page", () => {
    inRouter(<PageHeader title="Tauschbörse" />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings.map((h) => h.textContent)).toEqual(["Tauschbörse"]);
  });

  it("US-QS-14 the back link is named after its target and leads to its address", async () => {
    render(
      <MemoryRouter initialEntries={["/friends/exchange"]}>
        <Routes>
          <Route
            path="/friends/exchange"
            element={
              <PageHeader
                title="Tauschbörse"
                back={{ label: "Zurück zu Freunde", to: "/friends" }}
              />
            }
          />
          <Route path="/friends" element={<p>Freunde-Liste</p>} />
        </Routes>
      </MemoryRouter>,
    );
    const back = screen.getByRole("link", { name: "Zurück zu Freunde" });
    expect(back.getAttribute("href")).toBe("/friends");
    await userEvent.click(back);
    expect(screen.getByText("Freunde-Liste")).toBeTruthy();
  });

  it("US-QS-14 the back button has an accessible name and calls back", async () => {
    const onBack = vi.fn();
    render(<PageHeader title="Messen: Aloe" back={{ label: "Zurück zur Sammlung", onBack }} />);
    await userEvent.click(screen.getByRole("button", { name: "Zurück zur Sammlung" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("US-QS-14 · DS-15 the back control is a 44 px icon target, not a text pill", () => {
    inRouter(<PageHeader title="Profil" back={{ label: "Zurück zu Konto", to: "/account" }} />);
    const back = screen.getByRole("link", { name: "Zurück zu Konto" });
    expect(back.className).toContain("min-h-[44px]");
    expect(back.className).toContain("min-w-[44px]");
    expect(back.textContent).toBe("");
  });

  it("US-QS-14 the optional action renders beside the title", () => {
    inRouter(<PageHeader title="Freunde" action={<button type="button">Geräte</button>} />);
    expect(screen.getByRole("heading", { level: 1, name: "Freunde" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Geräte" })).toBeTruthy();
  });

  it("US-QS-14 without a back target the header shows no back control", () => {
    inRouter(<PageHeader title="Prüfliste" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("US-QS-14 a section header is a level-2 heading, so the page keeps its one h1 elsewhere", () => {
    inRouter(<PageHeader title="Profil" heading="h2" />);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Profil" })).toBeTruthy();
  });

  it("US-QS-15 at a large text size the action wraps below the title instead of squeezing it to nothing", () => {
    inRouter(
      <PageHeader
        title="Tauschbörse"
        action={<button type="button">Zum Tausch anbieten</button>}
      />,
    );
    const row = document.querySelector("[data-page-header]");
    expect(row?.className).toContain("flex-wrap");
    const title = screen.getByRole("heading", { level: 1 });
    expect(title.className).toContain("min-w-min");
    expect(screen.getByRole("button").parentElement?.className).toContain("max-w-full");
  });

  it("NFR-13 with a way back the title claims 230 px beside the back control, so a narrower row wraps and the back control sits above the title", () => {
    inRouter(
      <PageHeader
        title="Adiantum raddianum"
        back={{ label: "Zurück zur Suche", to: "/discover" }}
      />,
    );
    const row = document.querySelector("[data-page-header]");
    expect(row?.className).toContain("flex-wrap");
    const title = screen.getByRole("heading", { level: 1 });
    expect(title.className).toContain("basis-[230px]");
    expect(title.className).toContain("grow");
    expect(title.className).not.toContain("min-w-20");
    expect(screen.getByRole("link", { name: "Zurück zur Suche" }).className).toContain("shrink-0");
  });

  it("NFR-13 a title beside a way back keeps its longest word whole at 200 % text; only a word wider than the column may break", () => {
    inRouter(
      <PageHeader
        title="Passende Angebote"
        back={{ label: "Zurück zu Freunde", to: "/friends" }}
      />,
    );
    const classes = screen.getByRole("heading", { level: 1 }).className.split(" ");
    // `anywhere` would take the word out of the flex minimum, so the title could stay narrower than its longest word.
    expect(classes).not.toContain("[overflow-wrap:anywhere]");
    expect(classes).toContain("[overflow-wrap:break-word]");
    // An explicit minimum would replace the content-based one; `max-w-full` caps that one at the column.
    expect(classes.filter((c) => c.startsWith("min-w-"))).toEqual([]);
    expect(classes).toContain("max-w-full");
  });

  it("NFR-13 the back control keeps its 44 px target and does not shrink when the title takes the row below it", () => {
    render(
      <PageHeader
        title="Messen: Aloe"
        back={{ label: "Zurück zur Sammlung", onBack: () => undefined }}
      />,
    );
    const back = screen.getByRole("button", { name: "Zurück zur Sammlung" });
    expect(back.className).toContain("shrink-0");
    expect(back.className).toContain("min-h-[44px]");
    expect(back.className).toContain("min-w-[44px]");
  });

  it("NFR-13 with an action no word of the title breaks inside: the title is at least its longest word", () => {
    inRouter(
      <PageHeader
        title="Tauschbörse"
        action={<button type="button">Zum Tausch anbieten</button>}
      />,
    );
    const title = screen.getByRole("heading", { level: 1 });
    expect(title.className).toContain("min-w-min");
    expect(title.className).toContain("[overflow-wrap:normal]");
    expect(title.className).not.toContain("min-w-20");
    expect(title.className).not.toContain("anywhere");
  });

  it("NFR-13 with a way back and an action the title is at least its longest word, so the action wraps under the title (#1177)", () => {
    inRouter(
      <PageHeader
        title="Tauschbörse"
        back={{ label: "Zurück zu Freunde", to: "/friends" }}
        action={<button type="button">Zum Tausch anbieten</button>}
      />,
    );
    expect(document.querySelector("[data-page-header]")?.className).toContain("flex-wrap");
    const title = screen.getByRole("heading", { level: 1 });
    expect(title.className).toContain("min-w-min");
    expect(title.className).not.toContain("min-w-20");
    expect(title.className).not.toContain("min-w-[230px]");
  });

  it("NFR-13 without an action the title keeps the 5 rem minimum and the anywhere wrap, so other headers do not change", () => {
    inRouter(<PageHeader title="Freunde" />);
    const title = screen.getByRole("heading", { level: 1 });
    expect(title.className).toContain("min-w-20");
    expect(title.className).toContain("[overflow-wrap:anywhere]");
    expect(title.className).not.toContain("min-w-min");
  });
});

describe("US-QS-32 PageHeader in the top bar below md (SG-HEAD-01, SG-HEAD-04, SG-HEAD-05)", () => {
  const back = { label: "Zurück zu Freunde", to: "/friends" };

  it("US-QS-32 below md the h1, the way back and the actions go into the bar, and the content keeps none of them", () => {
    const { container } = render(
      <InShell>
        <PageHeader
          title="Tauschbörse"
          back={back}
          actions={[
            <button key="a" type="button">
              Zum Tausch anbieten
            </button>,
            <button key="b" type="button">
              Mehr
            </button>,
          ]}
        />
      </InShell>,
    );
    const bar = container.querySelector("[data-app-bar-slot]") as HTMLElement;
    const content = container.querySelector("main") as HTMLElement;
    expect(within(bar).getByRole("heading", { level: 1 }).textContent).toBe("Tauschbörse");
    expect(within(bar).getByRole("link", { name: "Zurück zu Freunde" }).getAttribute("href")).toBe(
      "/friends",
    );
    expect(
      within(bar)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Zum Tausch anbieten", "Mehr"]);
    expect(content.querySelector("h1")).toBeNull();
    expect(content.querySelector("[data-page-header]")).toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("US-QS-32 below md the bar title is 18 px semibold and wraps instead of being cut, the row is at least 44 px high", () => {
    render(
      <InShell>
        <PageHeader title="Tauschbörse" back={back} />
      </InShell>,
    );
    const title = screen.getByRole("heading", { level: 1 });
    expect(title.className).toContain("text-lg");
    expect(title.className).toContain("font-semibold");
    expect(title.className).toContain("break-words");
    expect(title.className).not.toContain("truncate");
    expect(document.querySelector("[data-page-header]")?.className).toContain("min-h-[44px]");
  });

  it("US-QS-32 the bar's back control keeps its 44 px target and stays at the leading edge", () => {
    render(
      <InShell>
        <PageHeader title="Tauschbörse" back={back} />
      </InShell>,
    );
    const link = screen.getByRole("link", { name: "Zurück zu Freunde" });
    expect(link.className).toContain("min-h-[44px]");
    expect(link.className).toContain("min-w-[44px]");
    expect(link.className).toContain("shrink-0");
    expect(link.parentElement?.closest("[data-app-bar-slot]")).not.toBeNull();
    expect(link.parentElement?.firstElementChild).toBe(link);
  });

  it("US-QS-32 wide (md and up) the header stays in the content, as before, even with a bar", () => {
    setViewportWidth(1024);
    const { container } = render(
      <InShell>
        <PageHeader title="Tauschbörse" back={back} />
      </InShell>,
    );
    expect((container.querySelector("[data-app-bar-slot]") as HTMLElement).children).toHaveLength(
      0,
    );
    expect(container.querySelector("main h1")?.textContent).toBe("Tauschbörse");
    expect(screen.getByRole("heading", { level: 1 }).className).toContain("text-2xl");
  });

  it("US-QS-32 without a bar (no shell) the header stays in the content on a phone", () => {
    const { container } = inRouter(<PageHeader title="Freunde" />);
    expect(container.querySelector("h1")?.textContent).toBe("Freunde");
  });

  it("US-QS-32 a section header (h2) never goes into the bar", () => {
    const { container } = render(
      <InShell>
        <PageHeader title="Profil" heading="h2" />
      </InShell>,
    );
    expect((container.querySelector("[data-app-bar-slot]") as HTMLElement).children).toHaveLength(
      0,
    );
    expect(container.querySelector("main h2")?.textContent).toBe("Profil");
  });

  it("US-QS-32 the subject (the object's name) stays inline in the content, never in the bar", () => {
    const { container } = render(
      <InShell>
        <PageHeader title="Messen" back={back} subject="Aloe vera" />
      </InShell>,
    );
    const bar = container.querySelector("[data-app-bar-slot]") as HTMLElement;
    const content = container.querySelector("main") as HTMLElement;
    expect(within(bar).queryByText("Aloe vera")).toBeNull();
    const subject = within(content).getByText("Aloe vera");
    expect(subject.tagName).toBe("P");
    expect(subject.className).toContain("text-base");
    expect(subject.className).toContain("font-semibold");
    expect(subject.className).toContain("line-clamp-2");
    expect(subject.className).toContain("break-words");
  });

  it("US-QS-32 at most two actions: two render in the bar, the type allows no third", () => {
    const pair: PageActions = [<span key="a" />, <span key="b" />];
    // @ts-expect-error SG-HEAD-04, SG-HEAD-05: a third action is refused by the type
    const three: PageActions = [<span key="a" />, <span key="b" />, <span key="c" />];
    expect(pair.length + three.length).toBe(5);
    const { container } = render(
      <InShell>
        <PageHeader title="Sammlung" actions={pair} />
      </InShell>,
    );
    expect(
      (container.querySelector("[data-app-bar-slot]") as HTMLElement).children[0]?.querySelectorAll(
        "span",
      ),
    ).toHaveLength(2);
  });

  it("US-QS-32 the claim is released when the header unmounts: the brand comes back", () => {
    const { rerender, container } = render(
      <InShell>
        <PageHeader title="Heute" />
      </InShell>,
    );
    expect(container.querySelector("[data-app-bar-slot] h1")).not.toBeNull();
    rerender(
      <InShell>
        <p>Keine Kopfzeile</p>
      </InShell>,
    );
    expect(container.querySelector("[data-app-bar-slot] h1")).toBeNull();
  });
});
