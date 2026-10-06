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

const region = () => document.querySelector<HTMLElement>("[aria-live=polite]");

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
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1);
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
