// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Switch } from "./switch";

afterEach(cleanup);

function Controlled(props: { onChange?: (next: boolean) => void }) {
  const [on, setOn] = useState(false);
  return (
    <Switch
      aria-label="Empfehlungen zeigen"
      checked={on}
      onCheckedChange={(next) => {
        props.onChange?.(next);
        setOn(next);
      }}
    />
  );
}

describe("US-QS-32 Switch: a setting that applies at once is a switch (SG-CTRL-02)", () => {
  it("US-QS-32 is a button with role switch that says on or off through aria-checked", async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const toggle = screen.getByRole("switch", { name: "Empfehlungen zeigen" });
    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await userEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("US-QS-32 the keyboard turns it with Space and it keeps the focus", async () => {
    render(<Controlled />);
    const toggle = screen.getByRole("switch");
    await userEvent.tab();
    expect(document.activeElement).toBe(toggle);
    await userEvent.keyboard(" ");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(toggle);
  });

  it("US-QS-32 · SG-TOUCH-01 the button itself is the 44 px target (not a pseudo-element): 52 x 44 px with the 32 px track inside", () => {
    render(<Controlled />);
    const toggle = screen.getByRole("switch");
    expect(toggle.className).toContain("h-11");
    expect(toggle.className).toContain("w-[52px]");
    expect(toggle.className).not.toContain("after:");
    const track = toggle.querySelector("[data-slot=switch-track]");
    expect(track?.className).toContain("h-8");
    expect(track?.querySelector("[data-slot=switch-thumb]")).toBeTruthy();
  });

  it("US-QS-32 · DS-38 an invalid switch is exposed with aria-invalid", () => {
    render(<Switch aria-label="x" checked={false} onCheckedChange={() => undefined} invalid />);
    expect(screen.getByRole("switch").getAttribute("aria-invalid")).toBe("true");
  });

  it("US-QS-32 · DS-36 caller classes merge last", () => {
    render(
      <Switch aria-label="x" className="w-[60px]" checked onCheckedChange={() => undefined} />,
    );
    const toggle = screen.getByRole("switch");
    expect(toggle.className).toContain("w-[60px]");
    expect(toggle.className).not.toContain("w-[52px]");
  });
});
