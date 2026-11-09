// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { AnnouncerProvider } from "./announcer";
import { useAnnounce } from "./context";

afterEach(cleanup);

function Save() {
  const announcer = useAnnounce();
  return (
    <>
      <input aria-label="Name" />
      <button type="button" onClick={() => announcer?.announce("Gespeichert")}>
        Speichern
      </button>
      <button type="button" onClick={() => announcer?.announce("Behandlung abgehakt")}>
        Abhaken
      </button>
    </>
  );
}

// The announcer's own region (`sr-only`); the toast viewport of the test wrapper has its regions of its own.
const region = () => document.querySelector<HTMLElement>(".sr-only[aria-live=polite]");

function Offline() {
  const announcer = useAnnounce();
  return (
    <button
      type="button"
      onClick={() =>
        announcer?.announce("Du bist offline.", "Die Änderung wartet, bis du wieder online bist.")
      }
    >
      Offline melden
    </button>
  );
}

describe("US-QS-07 · a note on screen is an overlay that never moves the page (DS-54)", () => {
  it("US-QS-07 · the note lies in an overlay outside the page's flow and is announced once (issue 1644, F8)", async () => {
    render(
      <AnnouncerProvider>
        <p>Inhalt</p>
        <Offline />
      </AnnouncerProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Offline melden" }));
    const note = screen.getByText("Die Änderung wartet, bis du wieder online bist.");
    expect(note.closest(".fixed")).not.toBeNull();
    expect(note.closest(".pointer-events-none")).not.toBeNull();
    expect(region()?.textContent).toBe("Du bist offline.");
  });
});

describe("US-QS-10 · one polite live region for every announcement (4.1.3)", () => {
  it("US-QS-10 announces a result in the live region without moving the focus", async () => {
    render(
      <AnnouncerProvider>
        <Save />
      </AnnouncerProvider>,
    );
    await userEvent.click(screen.getByLabelText("Name"));
    await userEvent.keyboard("{Tab}");
    const button = screen.getByRole("button", { name: "Speichern" });
    expect(document.activeElement).toBe(button);
    await userEvent.keyboard("{Enter}");
    expect(region()?.textContent).toBe("Gespeichert");
    expect(document.activeElement).toBe(button);
  });

  it("US-QS-10 the region exists before the first message, so a screen reader notices the change", () => {
    render(
      <AnnouncerProvider>
        <Save />
      </AnnouncerProvider>,
    );
    expect(region()).not.toBeNull();
    expect(region()?.textContent).toBe("");
    expect(document.querySelectorAll(".sr-only[aria-live]")).toHaveLength(1);
  });

  it("US-QS-10 the same message twice in a row is announced twice", async () => {
    render(
      <AnnouncerProvider>
        <Save />
      </AnnouncerProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    const first = region()?.textContent;
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    });
    const second = region()?.textContent;
    expect(second?.trim()).toBe("Gespeichert");
    expect(second).not.toBe(first);
  });

  it("US-QS-10 without a provider an announcement does nothing and does not fail", async () => {
    render(<Save />);
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(region()).toBeNull();
  });
});
