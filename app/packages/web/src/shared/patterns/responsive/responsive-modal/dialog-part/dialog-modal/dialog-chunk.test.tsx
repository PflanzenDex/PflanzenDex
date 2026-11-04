// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { ResponsiveModal } from "../../responsive-modal";

// The chunk request fails while `broken` is set (offline, or a deployment replaced the file), then works.
const chunk = vi.hoisted(() => ({ broken: true }));
vi.mock("@/shared/platform/routing/lazy-page/lazy-page", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("@/shared/platform/routing/lazy-page/lazy-page")>();
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

describe("Dialog chunk (NFR-12, DS-08)", () => {
  it("NFR-12 · DS-08 a failed dialog chunk shows an error with 'Erneut versuchen' that loads it again, never nothing", async () => {
    setViewportWidth(1024);
    render(
      <ResponsiveModal title="Pflanze bearbeiten" trigger={<button>Öffnen</button>}>
        <button>Speichern</button>
      </ResponsiveModal>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Das Fenster konnte nicht geladen werden.");
    expect(alert.textContent).not.toContain("Failed to fetch");
    chunk.broken = false;
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByRole("dialog", { name: "Pflanze bearbeiten" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
