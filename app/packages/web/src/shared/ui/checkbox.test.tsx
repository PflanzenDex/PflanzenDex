// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Checkbox } from "./checkbox";
import { NetworkSlot } from "./button.network-gate";

afterEach(cleanup);

describe("Checkbox (US-QS-07, DS-15, DS-38)", () => {
  it("US-QS-07 · DS-15 the label text names the checkbox and clicking it toggles", async () => {
    const onChange = vi.fn();
    render(<Checkbox onChange={onChange}>Erinnerung senden</Checkbox>);
    const box = screen.getByRole("checkbox", { name: "Erinnerung senden" }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    await userEvent.click(screen.getByText("Erinnerung senden"));
    expect(box.checked).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("US-QS-07 · DS-15 the whole row is the 44 px target", () => {
    render(<Checkbox>Erinnerung senden</Checkbox>);
    const row = screen.getByText("Erinnerung senden").closest("label");
    expect(row?.className).toContain("min-h-[44px]");
  });

  it("US-QS-07 · DS-36 forwards the ref to the input and merges caller classes last", () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <Checkbox ref={ref} className="size-6">
        Eins
      </Checkbox>,
    );
    expect(ref.current).toBe(screen.getByRole("checkbox"));
    expect(ref.current?.className).toContain("size-6");
    expect(ref.current?.className).not.toContain("size-5");
  });

  it("US-QS-07 · DS-38 an invalid checkbox is exposed with aria-invalid and its error text", () => {
    render(
      <>
        <Checkbox invalid aria-describedby="e">
          Bedingungen
        </Checkbox>
        <p id="e">Bitte zustimmen.</p>
      </>,
    );
    const box = screen.getByRole("checkbox", { name: "Bedingungen" });
    expect(box.getAttribute("aria-invalid")).toBe("true");
    expect(box.getAttribute("aria-describedby")).toBe("e");
  });

  it("US-QS-07 · DS-39 a disabled checkbox cannot be toggled", async () => {
    const onChange = vi.fn();
    render(
      <Checkbox disabled onChange={onChange}>
        Gesperrt
      </Checkbox>,
    );
    await userEvent.click(screen.getByText("Gesperrt"));
    expect(onChange).not.toHaveBeenCalled();
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
  });

  it("US-QS-07 · DS-37 shows the focus ring on the box", () => {
    render(<Checkbox>Eins</Checkbox>);
    expect(screen.getByRole("checkbox").className).toContain("focus-visible:ring-2");
  });
});

describe("Checkbox needsNetwork (US-QS-30 · SG-BTN-05)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("US-QS-30 · offline a controlled box that needs the network keeps its state and says why next to it", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const onChange = vi.fn();
    render(
      <Checkbox needsNetwork checked={false} onChange={onChange}>
        Keine Empfehlungen
      </Checkbox>,
    );
    await userEvent.click(screen.getByText("Keine Empfehlungen"));
    const box = screen.getByRole("checkbox", { name: "Keine Empfehlungen" }) as HTMLInputElement;
    expect(onChange).not.toHaveBeenCalled();
    expect(box.checked).toBe(false);
    expect(box.getAttribute("aria-disabled")).toBe("true");
    const reason = document.getElementById(box.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe("Du bist offline. Das geht erst wieder mit Verbindung.");
  });

  it("US-QS-30 · an uncontrolled box cannot ask for needsNetwork (the type requires checked)", () => {
    // @ts-expect-error a box that writes at once is controlled: `checked` is required with needsNetwork
    const element = <Checkbox needsNetwork>Ohne Zustand</Checkbox>;
    expect(element).toBeTruthy();
  });

  it("US-QS-30 · online again the controlled box takes the change", async () => {
    const state = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const onChange = vi.fn();
    render(
      <Checkbox needsNetwork checked={false} onChange={onChange}>
        Alles privat
      </Checkbox>,
    );
    state.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    await userEvent.click(screen.getByText("Alles privat"));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("US-QS-30 · a box in a NetworkSlot names the group's line and shows no line of its own", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    render(
      <NetworkSlot>
        <Checkbox needsNetwork checked={false} onChange={() => {}}>
          Eins
        </Checkbox>
      </NetworkSlot>,
    );
    const box = screen.getByRole("checkbox", { name: "Eins" });
    const ids = (box.getAttribute("aria-describedby") ?? "").split(" ");
    expect(ids).toHaveLength(1);
    expect(document.getElementById(ids[0] ?? "")?.textContent).toBe(
      "Du bist offline. Das geht erst wieder mit Verbindung.",
    );
    expect(
      screen.getAllByText("Du bist offline. Das geht erst wieder mit Verbindung."),
    ).toHaveLength(1);
  });
});
