// @vitest-environment jsdom
// US-QS-25 · The status bar follows the page, also while a sheet or dialog dims it (issue 1691). The metas are built
// from the page constants like index.html's, the windows are the real sheet and dialog. index.html is checked in
// theme-colour.test.ts.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/overlays/dialog/dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/shared/ui/overlays/sheet/sheet";
import { PAGE_BACKGROUND, dimStatusBar, dimmedPageColour } from "./theme-colour";

const metaContent = (scheme: "light" | "dark") =>
  document
    .querySelector(`meta[name="theme-color"][media="(prefers-color-scheme: ${scheme})"]`)
    ?.getAttribute("content");
const now = () => ({ light: metaContent("light"), dark: metaContent("dark") });

const PAGE = { light: PAGE_BACKGROUND.light, dark: PAGE_BACKGROUND.dark };
const DIMMED = { light: dimmedPageColour("light"), dark: dimmedPageColour("dark") };

beforeAll(() => {
  // jsdom has no matchMedia, Vaul reads it (as in sheet.test.tsx).
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  // The two theme-colour metas of the page, with the page background of each scheme.
  document.head.insertAdjacentHTML(
    "beforeend",
    `<meta name="theme-color" content="${PAGE_BACKGROUND.light}" media="(prefers-color-scheme: light)">` +
      `<meta name="theme-color" content="${PAGE_BACKGROUND.dark}" media="(prefers-color-scheme: dark)">`,
  );
});

afterEach(() => {
  cleanup();
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove());
});

function SheetExample() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button type="button">Öffnen</button>
      </SheetTrigger>
      <SheetContent title="Filter">
        <button type="button">Anwenden</button>
      </SheetContent>
    </Sheet>
  );
}

function DialogExample() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button">Öffnen</button>
      </DialogTrigger>
      <DialogContent title="Filter">
        <button type="button">Anwenden</button>
      </DialogContent>
    </Dialog>
  );
}

describe("US-QS-25 · the status bar follows the page", () => {
  it("US-QS-25 with no backdrop on screen both theme-colour metas keep the page background of their scheme", () => {
    expect(now()).toEqual(PAGE);
  });

  it("US-QS-25 while a dimming is on, both metas take the dimmed colour of their scheme, so either system scheme shows it; ending it restores the page", () => {
    const end = dimStatusBar();
    expect(now()).toEqual(DIMMED);
    end();
    expect(now()).toEqual(PAGE);
  });

  it("US-QS-25 two backdrops keep the status bar dimmed until the second one leaves; ending one twice ends only that one", () => {
    const first = dimStatusBar();
    const second = dimStatusBar();
    first();
    first();
    expect(now()).toEqual(DIMMED);
    second();
    expect(now()).toEqual(PAGE);
  });

  it("US-QS-25 a sheet dims the status bar while it is open and restores it when it closes", async () => {
    render(<SheetExample />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    await screen.findByRole("dialog", { name: "Filter" });
    expect(now()).toEqual(DIMMED);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(now()).toEqual(PAGE));
  });

  it("US-QS-25 a dialog dims the status bar while it is open and restores it when it closes", async () => {
    render(<DialogExample />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    await screen.findByRole("dialog", { name: "Filter" });
    expect(now()).toEqual(DIMMED);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(now()).toEqual(PAGE));
  });
});
