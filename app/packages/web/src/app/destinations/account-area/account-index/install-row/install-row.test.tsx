// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  InstallChoice,
  InstallOffer,
} from "@/shared/platform/device/service-worker/install-prompt";
import { InstallRow } from "./install-row";

// The store is replaced by a switch, so the offer and the refusal can be set per test (US-QS-28). Re-rendering with
// `rerender` shows what the row draws from the store; the store's own rules are tested in install-prompt.test.ts.
const install = vi.hoisted(() => ({
  offer: "none" as InstallOffer,
  refused: false,
  prompt: vi.fn(async (): Promise<InstallChoice> => "accepted"),
}));
vi.mock("@/shared/platform/device/service-worker/install-prompt", () => ({
  useInstallOffer: () => install.offer,
  useInstallRefused: () => install.refused,
  promptInstall: () => install.prompt(),
}));

/** The row inside a list, as the Konto index renders it. */
const list = () => (
  <ul>
    <InstallRow />
  </ul>
);

afterEach(() => {
  cleanup();
  install.offer = "none";
  install.refused = false;
  install.prompt.mockClear();
  install.prompt.mockImplementation(async () => "accepted");
});

describe("US-QS-28 the install row of Konto", () => {
  it("US-QS-28 with the install on offer the index has the row App installieren, a button with its chevron", () => {
    install.offer = "promptable";
    render(list());
    const row = screen.getByRole("button", { name: "App installieren" });
    expect(row.querySelector("svg")).not.toBeNull();
  });

  it("US-QS-28 choosing the row asks the browser for the install", async () => {
    install.offer = "promptable";
    const user = userEvent.setup();
    render(list());
    await user.click(screen.getByRole("button", { name: "App installieren" }));
    expect(install.prompt).toHaveBeenCalledTimes(1);
  });

  it("US-QS-28 a second tap while the first prompt is open is unavailable and shows no refusal", async () => {
    install.offer = "promptable";
    install.prompt.mockImplementation(async () => "unavailable");
    const user = userEvent.setup();
    render(list());
    const row = screen.getByRole("button", { name: "App installieren" });
    await user.click(row);
    await user.click(row);
    expect(install.prompt).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("US-QS-28 a refused prompt says in text that the browser did not open the install, and points to its menu (P-10)", () => {
    install.offer = "none";
    install.refused = true;
    render(list());
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Der Browser hat die Installation nicht geöffnet");
    expect(status.textContent).toContain("Menü des Browsers");
  });

  it("US-QS-28 the refusal text goes when a new install event arrives and the row is back", () => {
    install.offer = "none";
    install.refused = true;
    const { rerender } = render(list());
    expect(screen.getByRole("status")).toBeTruthy();
    install.offer = "promptable";
    install.refused = false;
    rerender(list());
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "App installieren" })).toBeTruthy();
  });

  it("US-QS-28 the refusal text goes when the app is installed, and the index keeps no empty row", () => {
    install.offer = "none";
    install.refused = true;
    const { container, rerender } = render(list());
    install.refused = false;
    rerender(list());
    expect(screen.queryByRole("status")).toBeNull();
    expect(container.querySelector("ul")?.children.length).toBe(0);
  });

  it("US-QS-28 on Safari on an iPhone or iPad the row is the text guide Teilen → Zum Home-Bildschirm, with no action", () => {
    install.offer = "ios-guide";
    render(list());
    expect(screen.getByText("App auf den Home-Bildschirm legen")).toBeTruthy();
    expect(screen.getByText("In Safari: Teilen → Zum Home-Bildschirm")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("US-QS-28 with no offer (no installation, or an installed app) the index has no install row and no empty item", () => {
    install.offer = "none";
    const { container } = render(list());
    expect(container.querySelector("ul")?.children.length).toBe(0);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
