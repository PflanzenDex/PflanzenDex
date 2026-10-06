// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sheet, SheetContent, SheetTrigger } from "./sheet";

// The chunk request fails while `broken` is set (offline, or a deployment replaced the file), then works.
const chunk = vi.hoisted(() => ({ broken: true }));
vi.mock("@/components/routing/lazy-page/lazy-page", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/components/routing/lazy-page/lazy-page")>();
  return {
    ...real,
    lazyPage: ((load: () => Promise<never>) =>
      real.lazyPage(async () => {
        if (chunk.broken) throw new Error("Failed to fetch dynamically imported module");
        return load();
      })) as typeof real.lazyPage,
  };
});

afterEach(cleanup);

describe("Sheet chunk (US-QS-07, DS-08)", () => {
  it("US-QS-07 · DS-08 a failed chunk shows an error with 'Erneut versuchen' that loads it again, never nothing", async () => {
    render(
      <Sheet>
        <SheetTrigger asChild>
          <button>Öffnen</button>
        </SheetTrigger>
        <SheetContent title="Filter">
          <button>Anwenden</button>
        </SheetContent>
      </Sheet>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Das Fenster konnte nicht geladen werden.");
    expect(alert.textContent).not.toContain("Failed to fetch");
    chunk.broken = false;
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByRole("dialog", { name: "Filter" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
