// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AccountRouteSkeleton, AccountSectionSkeleton } from "./account-area.skeleton";

afterEach(cleanup);

describe("AccountSectionSkeleton (US-QS-14, DS-52, DS-57, issue 1697)", () => {
  it("US-QS-14 issue 1697 · a section shows one skeleton with its own loading text after the delay, and nothing before it", async () => {
    render(<AccountSectionSkeleton section="reminders" label="Erinnerungen werden geladen …" />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toContain("Erinnerungen werden geladen …");
  });

  it("US-QS-14 issue 1697 · every section keeps a shape of its own: the settings keep their six rows, the others their blocks", async () => {
    const { container, rerender } = render(
      <AccountSectionSkeleton section="settings" label="Einstellungen werden geladen …" />,
    );
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(6);
    rerender(<AccountSectionSkeleton section="aiClients" label="KI-Clients werden geladen …" />);
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});

describe("AccountRouteSkeleton (US-QS-14, issue 1697)", () => {
  it("US-QS-14 issue 1697 · 'Konto' stands at once as the one h1 of the index, the rows wait for the delay", async () => {
    render(<AccountRouteSkeleton section={undefined} />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe("Konto");
    expect(headings[0]?.hasAttribute("data-route-fallback")).toBe(true);
    expect(screen.queryByRole("status")).toBeNull();
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("US-QS-14 issue 1697 · an unknown segment shows the index's rows, a section the rows of its kind", async () => {
    const { rerender } = render(<AccountRouteSkeleton section="unknown" />);
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Konto wird geladen …");
    rerender(<AccountRouteSkeleton section="profile" />);
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Profil wird geladen …");
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});
