// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { likelySignedIn } from "@/account";
import { beginAppStart } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { StartFrame } from "./start-frame";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function frameAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <StartFrame />
    </MemoryRouter>,
  );
}

describe("US-QS-32 one loading picture from the app start to the page (SG-STATE-02, F-0060, issue 1876)", () => {
  it("US-QS-32 · SG-STATE-02 the start frame draws both bars with the boxes of the shell and the page skeleton in main", () => {
    const end = beginAppStart();
    try {
      const { container } = frameAt("/collection");
      expect(screen.getByRole("main")).toBeTruthy();
      expect(screen.getByRole("heading", { level: 1, name: "Sammlung" })).toBeTruthy();
      // The page skeleton shows at once at the start (Q-27): one status with its loading text.
      expect(screen.getAllByRole("status")).toHaveLength(1);
      const bar = container.querySelector("[data-start-bar]");
      expect(bar?.className).toContain("tall-window:fixed");
      expect(bar?.getAttribute("aria-hidden")).toBe("true");
      expect(bar?.children).toHaveLength(5);
    } finally {
      end();
    }
  });

  it("US-QS-32 · SG-STATE-02 the start frame holds no control: the bars are drawn, not operable", () => {
    frameAt("/");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("US-QS-32 a device with a kept, live sign-in likely opens signed in; an expired or missing one does not", () => {
    const key = "oidc.user:https://id.example:pflanzendex";
    expect(likelySignedIn()).toBe(false);
    window.localStorage.setItem(key, JSON.stringify({ expires_at: Date.now() / 1000 - 60 }));
    expect(likelySignedIn()).toBe(false);
    window.localStorage.setItem(key, "kein JSON");
    expect(likelySignedIn()).toBe(false);
    window.localStorage.setItem(key, JSON.stringify({ expires_at: Date.now() / 1000 + 3600 }));
    expect(likelySignedIn()).toBe(true);
  });
});
