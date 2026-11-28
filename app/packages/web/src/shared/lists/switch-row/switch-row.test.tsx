// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NetworkSlot } from "@/shared/ui/button.network-gate";
import { GroupedList } from "../grouped-list/grouped-list";
import { SwitchRow, type SwitchRowProps } from "./switch-row";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Row(props: Partial<SwitchRowProps> & { start?: boolean }) {
  const [on, setOn] = useState(props.start ?? false);
  return (
    <SwitchRow
      bare
      label="Empfehlungen zeigen"
      help="Nur du siehst sie."
      {...props}
      checked={props.checked ?? on}
      onCheckedChange={(next) => {
        props.onCheckedChange?.(next);
        setOn(next);
      }}
    />
  );
}

describe("US-QS-32 SwitchRow: a setting that applies at once is a switch in a full-width row (SG-CTRL-02)", () => {
  it("US-QS-32 names the switch by the label and describes it by the one secondary line", () => {
    render(<Row />);
    const toggle = screen.getByRole("switch", { name: "Empfehlungen zeigen" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    const described = document.getElementById(toggle.getAttribute("aria-describedby") ?? "");
    expect(described?.textContent).toBe("Nur du siehst sie.");
  });

  it("US-QS-32 a tap on the label or on the secondary line turns the switch; the whole row is the target", async () => {
    const onCheckedChange = vi.fn();
    render(<Row onCheckedChange={onCheckedChange} />);
    await userEvent.click(screen.getByText("Empfehlungen zeigen"));
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);
    await userEvent.click(screen.getByText("Nur du siehst sie."));
    expect(onCheckedChange).toHaveBeenLastCalledWith(false);
    const label = screen.getByText("Empfehlungen zeigen").closest("label");
    expect(label?.className).toContain("after:inset-0");
    expect(label?.parentElement?.className).toContain("min-h-11");
  });

  it("US-QS-32 the label comes first and the switch last (leading label, trailing switch)", () => {
    render(<Row />);
    const row = screen.getByText("Empfehlungen zeigen").closest("label")?.parentElement;
    const children = Array.from(row?.children ?? []);
    expect(children[0]?.tagName).toBe("LABEL");
    expect(children[children.length - 1]?.getAttribute("role")).toBe("switch");
  });

  it("US-QS-32 the label wraps instead of being cut, so it works at 200 % text", () => {
    render(<Row label="Meine Sammlung in die Seltenheit in PflanzenDéx einrechnen" />);
    const label = screen.getByText(/Meine Sammlung/);
    expect(label.className).toContain("[overflow-wrap:anywhere]");
    expect(label.className).not.toContain("truncate");
  });

  it("US-QS-32 a busy row keeps the focus (aria-disabled, not disabled) and drops a press", async () => {
    const onCheckedChange = vi.fn();
    render(<Row busy onCheckedChange={onCheckedChange} />);
    const toggle = screen.getByRole<HTMLButtonElement>("switch");
    expect(toggle.disabled).toBe(false);
    expect(toggle.getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(toggle);
    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("US-QS-32 · P-10 an error stands at the row, is an alert and is linked to the switch", () => {
    render(<Row error="Das ging nicht." />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Das ging nicht.");
    const toggle = screen.getByRole("switch");
    expect(toggle.getAttribute("aria-describedby")).toContain(alert.id);
    expect(toggle.getAttribute("aria-invalid")).toBe("true");
  });

  it("US-QS-32 the controlled state is the stored state: a refused save keeps the switch where it was", async () => {
    const onCheckedChange = vi.fn();
    render(
      <SwitchRow bare label="Alles privat" checked={false} onCheckedChange={onCheckedChange} />,
    );
    await userEvent.click(screen.getByRole("switch"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
  });

  it("US-QS-32 a leading picture stands before the label and the row is a list item inside a GroupedList", () => {
    render(
      <GroupedList label="Pflanzen">
        <SwitchRow
          label="Clip mit Freunden teilen"
          leading={<img alt="" src="data:," />}
          checked
          onCheckedChange={() => undefined}
        />
      </GroupedList>,
    );
    const item = screen.getByRole("listitem");
    expect(within(item).getByRole("switch", { name: "Clip mit Freunden teilen" })).toBeTruthy();
    expect(item.querySelector("img")).toBeTruthy();
  });
});

describe("US-QS-30 · US-QS-32 SwitchRow offline", () => {
  it("US-QS-30 offline a row that needs the network keeps its state, drops the press and says why", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const onCheckedChange = vi.fn();
    render(<Row needsNetwork onCheckedChange={onCheckedChange} />);
    const toggle = screen.getByRole("switch");
    await userEvent.click(toggle);
    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(toggle.getAttribute("aria-disabled")).toBe("true");
    const reason = toggle
      .getAttribute("aria-describedby")
      ?.split(" ")
      .map((id) => document.getElementById(id)?.textContent);
    expect(reason).toContain("Du bist offline. Das geht erst wieder mit Verbindung.");
  });

  it("US-QS-30 in a NetworkSlot the reason stands once below the group", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    render(
      <NetworkSlot>
        <Row needsNetwork label="Eins" />
        <Row needsNetwork label="Zwei" />
      </NetworkSlot>,
    );
    expect(
      screen.getAllByText("Du bist offline. Das geht erst wieder mit Verbindung."),
    ).toHaveLength(1);
  });

  it("US-QS-30 online the row works and shows no reason", async () => {
    const onCheckedChange = vi.fn();
    render(<Row needsNetwork onCheckedChange={onCheckedChange} />);
    await userEvent.click(screen.getByRole("switch"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(screen.queryByText(/offline/)).toBeNull();
  });
});
