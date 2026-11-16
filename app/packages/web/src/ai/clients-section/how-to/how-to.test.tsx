// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HowTo } from "./how-to";
import { AnnouncerProvider } from "../../../shared/platform/announcer/announcer";

/** The page of the how-to: the announcer is mounted above it, as in the app shell (US-QS-32). */
const renderHowTo = () =>
  render(
    <AnnouncerProvider>
      <HowTo address="http://api/mcp" />
    </AnnouncerProvider>,
  );

/** What the announcer says (its polite live region, `sr-only`). */
const announced = () =>
  document.querySelector<HTMLElement>('.sr-only[aria-live="polite"]')?.textContent ?? "";

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("US-QS-32 · F-0301 the copy of the address says what happened", () => {
  it("US-QS-32 · F-0301 a copy reads 'Adresse kopiert' and is announced", async () => {
    stubClipboard(vi.fn(async () => undefined));
    renderHowTo();
    fireEvent.click(screen.getByRole("button", { name: "Adresse kopieren" }));
    expect(await screen.findByRole("button", { name: "Adresse kopiert" })).toBeTruthy();
    expect(announced()).toBe("Adresse kopiert.");
  });

  it("US-QS-32 · F-0301 'Adresse kopiert' stays for about 3 s, then the button reads 'Adresse kopieren' again", async () => {
    vi.useFakeTimers();
    stubClipboard(vi.fn(async () => undefined));
    renderHowTo();
    fireEvent.click(screen.getByRole("button", { name: "Adresse kopieren" }));
    await act(async () => undefined);
    expect(screen.getByRole("button", { name: "Adresse kopiert" })).toBeTruthy();
    act(() => vi.advanceTimersByTime(2_999));
    expect(screen.getByRole("button", { name: "Adresse kopiert" })).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("button", { name: "Adresse kopieren" })).toBeTruthy();
  });

  it("US-QS-32 · F-0301 a refused copy shows the failure line right under the button, as an alert, and says no success", async () => {
    stubClipboard(vi.fn(async () => Promise.reject(new Error("denied"))));
    renderHowTo();
    fireEvent.click(screen.getByRole("button", { name: "Adresse kopieren" }));
    const failure = await screen.findByRole("alert");
    expect(failure.textContent).toBe(
      "Kopieren hat nicht geklappt. Markiere die Adresse oben und kopiere sie selbst.",
    );
    const button = screen.getByRole("button", { name: "Adresse kopieren" });
    expect(button.compareDocumentPosition(failure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(announced()).toBe("");
  });
});
