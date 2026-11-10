// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  InstallChoice,
  InstallOffer,
} from "@/shared/platform/device/service-worker/install-prompt";
import { InstallRow } from "./install-row";

// The store is replaced by a switch, so each state of the offer can be set (US-QS-28).
const install = vi.hoisted(() => ({
  offer: "none" as InstallOffer,
  prompt: vi.fn(async (): Promise<InstallChoice> => "accepted"),
}));
vi.mock("@/shared/platform/device/service-worker/install-prompt", () => ({
  useInstallOffer: () => install.offer,
  promptInstall: () => install.prompt(),
}));

/** The row inside a list, as the Konto index renders it. */
const inList = () =>
  render(
    <ul>
      <InstallRow />
    </ul>,
  );

afterEach(() => {
  cleanup();
  install.offer = "none";
  install.prompt.mockClear();
  install.prompt.mockImplementation(async () => "accepted");
});

describe("US-QS-28 the install row of Konto", () => {
  it("US-QS-28 with the install on offer the index has the row App installieren, a button with its chevron", () => {
    install.offer = "promptable";
    inList();
    const row = screen.getByRole("button", { name: "App installieren" });
    expect(row.querySelector("svg")).not.toBeNull();
  });

  it("US-QS-28 choosing the row asks the browser for the install", async () => {
    install.offer = "promptable";
    const user = userEvent.setup();
    inList();
    await user.click(screen.getByRole("button", { name: "App installieren" }));
    expect(install.prompt).toHaveBeenCalledTimes(1);
  });

  it("US-QS-28 a refused prompt says in text that the browser did not open the install, and points to its menu (P-10)", async () => {
    install.offer = "promptable";
    install.prompt.mockImplementation(async () => "failed");
    const user = userEvent.setup();
    inList();
    await user.click(screen.getByRole("button", { name: "App installieren" }));
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("Der Browser hat die Installation nicht geöffnet");
    expect(status.textContent).toContain("Menü des Browsers");
  });

  it("US-QS-28 on Safari on an iPhone or iPad the row is the text guide Teilen → Zum Home-Bildschirm, with no action", () => {
    install.offer = "ios-guide";
    inList();
    expect(screen.getByText("App auf den Home-Bildschirm legen")).toBeTruthy();
    expect(screen.getByText("In Safari: Teilen → Zum Home-Bildschirm")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("US-QS-28 with no offer (no installation, or an installed app) the index has no install row and no empty item", () => {
    install.offer = "none";
    const { container } = render(
      <ul>
        <InstallRow />
      </ul>,
    );
    expect(container.querySelector("ul")?.children.length).toBe(0);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
