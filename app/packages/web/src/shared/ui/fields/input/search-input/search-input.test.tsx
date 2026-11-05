// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { SearchInput } from "./search-input";

afterEach(cleanup);

function Harness(props: { initial: string; disabled?: boolean }) {
  const [text, setText] = useState(props.initial);
  return (
    <SearchInput
      aria-label="Suche"
      value={text}
      disabled={props.disabled}
      onChange={(e) => setText(e.target.value)}
      onClear={() => setText("")}
    />
  );
}

describe("SearchInput (US-QS-24, US-ONB-01, issue 1094)", () => {
  it("US-QS-24 shows no clear button while the field is empty", () => {
    render(<Harness initial="" />);
    expect(screen.queryByRole("button", { name: "Suche leeren" })).toBeNull();
  });

  it("US-QS-24 shows the button 'Suche leeren' once there is text, and it is a type=search field", () => {
    render(<Harness initial="" />);
    const field = screen.getByRole("searchbox", { name: "Suche" });
    fireEvent.change(field, { target: { value: "Mon" } });
    const button = screen.getByRole("button", { name: "Suche leeren" });
    expect(button.className).toContain("min-h-[44px]");
    expect(button.className).toContain("min-w-[44px]");
  });

  it("US-ONB-01 a click clears the text and puts the focus back into the field", async () => {
    const user = userEvent.setup();
    render(<Harness initial="Monstera" />);
    await user.click(screen.getByRole("button", { name: "Suche leeren" }));
    const field = screen.getByRole("searchbox", { name: "Suche" }) as HTMLInputElement;
    expect(field.value).toBe("");
    expect(document.activeElement).toBe(field);
    expect(screen.queryByRole("button", { name: "Suche leeren" })).toBeNull();
  });

  it("US-QS-24 the keyboard reaches the button with Tab and Enter clears", async () => {
    const user = userEvent.setup();
    render(<Harness initial="Ficus" />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "Suche" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Suche leeren" }));
    await user.keyboard("{Enter}");
    expect((screen.getByRole("searchbox", { name: "Suche" }) as HTMLInputElement).value).toBe("");
  });

  it("US-QS-24 a disabled field has no clear button", () => {
    render(<Harness initial="Ficus" disabled />);
    expect(screen.queryByRole("button", { name: "Suche leeren" })).toBeNull();
  });
});
