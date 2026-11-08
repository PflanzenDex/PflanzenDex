// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lazyPage } from "@/shared/platform/routing/lazy-page/lazy-page";
import { RouteBoundary } from "./route-boundary";

afterEach(cleanup);

describe("US-QS-07 · DS-08 lazyPage and RouteBoundary", () => {
  it("US-QS-07 · DS-08 shows one loading status until the chunk is there, then the page with its props", async () => {
    let release: (c: { default: (p: { title: string }) => React.ReactElement }) => void = () =>
      undefined;
    const Page = lazyPage<(p: { title: string }) => React.ReactElement>(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    render(
      <RouteBoundary resetKey="a">
        <Page title="Meine Sammlung" />
      </RouteBoundary>,
    );
    // The skeleton shows after the delay (US-QS-14, DS-57, issue 1697), exactly once.
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByText("Lädt…")).toBeTruthy();
    release({ default: (p) => <h1>{p.title}</h1> });
    expect(await screen.findByRole("heading", { name: "Meine Sammlung" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("US-QS-14 issue 1697 · a page that arrives within the delay shows no skeleton and no status", async () => {
    let release: (c: { default: (p: { title: string }) => React.ReactElement }) => void = () =>
      undefined;
    const Page = lazyPage<(p: { title: string }) => React.ReactElement>(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    render(
      <RouteBoundary resetKey="a">
        <Page title="Schnell" />
      </RouteBoundary>,
    );
    release({ default: (p) => <h1>{p.title}</h1> });
    expect(await screen.findByRole("heading", { name: "Schnell" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("US-QS-14 · issue 1097 a destination is named while its chunk loads, and its page's heading replaces the name", async () => {
    let release: (c: { default: () => React.ReactElement }) => void = () => undefined;
    const Page = lazyPage<() => React.ReactElement>(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    render(
      <RouteBoundary resetKey="/friends" heading="Freunde">
        <Page />
      </RouteBoundary>,
    );
    // The name stands at once; only the blocks wait for the delay (US-QS-14, DS-57, issue 1697).
    expect(screen.getByRole("heading", { level: 1, name: "Freunde" })).toBeTruthy();
    expect(await screen.findByRole("status")).toBeTruthy();
    release({ default: () => <h1>Freunde</h1> });
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.hasAttribute("data-route-fallback")).toBe(false);
  });

  it("US-QS-07 · DS-08 a failed chunk shows an error with 'Erneut versuchen' that loads it again, never a blank page", async () => {
    let attempts = 0;
    const Page = lazyPage(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("Failed to fetch dynamically imported module");
      return { default: () => <h1>Geladen</h1> };
    });
    render(
      <RouteBoundary resetKey="a">
        <Page />
      </RouteBoundary>,
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Die Seite konnte nicht geladen werden.");
    expect(alert.textContent).not.toContain("Failed to fetch");
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByRole("heading", { name: "Geladen" })).toBeTruthy();
    expect(attempts).toBe(2);
  });

  it("US-QS-07 · DS-11 a failed chunk while offline says that the device is offline", async () => {
    const online = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const Page = lazyPage(async () => {
      throw new Error("offline");
    });
    render(
      <RouteBoundary resetKey="a">
        <Page />
      </RouteBoundary>,
    );
    expect((await screen.findByRole("alert")).textContent).toContain("offline");
    online.mockRestore();
  });

  it("US-QS-07 · DS-08 leaving a failed page by navigating clears the error", async () => {
    const Broken = lazyPage(async () => {
      throw new Error("x");
    });
    const { rerender } = render(
      <RouteBoundary resetKey="a">
        <Broken />
      </RouteBoundary>,
    );
    await screen.findByRole("alert");
    rerender(
      <RouteBoundary resetKey="b">
        <p>Andere Seite</p>
      </RouteBoundary>,
    );
    expect(screen.getByText("Andere Seite")).toBeTruthy();
  });
});
