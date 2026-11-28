// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Stepper } from "./stepper";

afterEach(cleanup);

function Controlled(props: { start?: number; onChange?: (n: number) => void }) {
  const [value, setValue] = useState(props.start ?? 2);
  return (
    <Stepper
      label="Mindestzahl offener Wünsche je Zone"
      value={value}
      onChange={(n) => {
        props.onChange?.(n);
        setValue(n);
      }}
    />
  );
}

describe("US-QS-32 Stepper: a whole number from 0 to 10 is a stepper (SG-CTRL-04)", () => {
  it("US-QS-32 is a group named by its label with a minus button, the value and a plus button", () => {
    render(<Controlled />);
    const group = screen.getByRole("group", { name: "Mindestzahl offener Wünsche je Zone" });
    expect(within(group).getByRole("button", { name: "Weniger" })).toBeTruthy();
    expect(within(group).getByRole("button", { name: "Mehr" })).toBeTruthy();
    expect(group.querySelector("output")?.textContent).toBe("2");
  });

  it("US-QS-32 the buttons change the number by one, with no keyboard and no typed text", async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Mehr" }));
    await userEvent.click(screen.getByRole("button", { name: "Mehr" }));
    expect(onChange).toHaveBeenLastCalledWith(4);
    await userEvent.click(screen.getByRole("button", { name: "Weniger" }));
    expect(onChange).toHaveBeenLastCalledWith(3);
    expect(document.querySelector("output")?.textContent).toBe("3");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("US-QS-32 the value is a polite live region, so the new number is said after a press", () => {
    render(<Controlled />);
    expect(document.querySelector("output")?.getAttribute("aria-live")).toBe("polite");
  });

  it("US-QS-32 at 0 'Weniger' changes nothing and at 10 'Mehr' changes nothing, and both keep the focus", async () => {
    const onChange = vi.fn();
    render(<Controlled start={0} onChange={onChange} />);
    const less = screen.getByRole("button", { name: "Weniger" });
    expect(less.getAttribute("aria-disabled")).toBe("true");
    expect((less as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(less);
    expect(onChange).not.toHaveBeenCalled();
    cleanup();
    render(<Controlled start={10} onChange={onChange} />);
    const more = screen.getByRole("button", { name: "Mehr" });
    expect(more.getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(more);
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(more);
  });

  it("US-QS-32 · SG-TOUCH-01 both buttons are 44 px targets", () => {
    render(<Controlled />);
    for (const name of ["Weniger", "Mehr"])
      expect(screen.getByRole("button", { name }).className).toContain("min-h-[44px]");
  });

  it("US-QS-32 other limits are honoured and the group forwards its id and description for a form control", async () => {
    const onChange = vi.fn();
    render(
      <>
        <Stepper
          id="s"
          aria-describedby="d"
          label="Anzahl"
          value={5}
          min={5}
          max={6}
          onChange={onChange}
        />
        <p id="d">Hilfe</p>
      </>,
    );
    const group = screen.getByRole("group", { name: "Anzahl" });
    expect(group.id).toBe("s");
    expect(group.getAttribute("aria-describedby")).toBe("d");
    await userEvent.click(screen.getByRole("button", { name: "Weniger" }));
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Mehr" }));
    expect(onChange).toHaveBeenCalledWith(6);
  });
});
