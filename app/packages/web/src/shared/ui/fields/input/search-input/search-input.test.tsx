// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { SearchInput } from "./search-input";

afterEach(cleanup);

function Harness(props: {
  initial: string;
  disabled?: boolean;
  keyHint?: { visible: string; aria: string };
}) {
  const [text, setText] = useState(props.initial);
  return (
    <SearchInput
      aria-label="Suche"
      value={text}
      disabled={props.disabled}
      keyHint={props.keyHint}
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

describe("US-QS-11 · the search field shows its key", () => {
  it("US-QS-11 the field names its shortcut for assistive technology and shows the key while it is empty", () => {
    render(<Harness initial="" keyHint={{ visible: "/", aria: "/" }} />);
    const field = screen.getByRole("searchbox");
    expect(field.getAttribute("aria-keyshortcuts")).toBe("/");
    expect(field.closest("div")?.querySelector("kbd")?.textContent).toBe("/");
  });

  it("US-QS-11 the key goes while the field holds text, where the clear button sits", () => {
    render(<Harness initial="Monstera" keyHint={{ visible: "/", aria: "/" }} />);
    expect(screen.getByRole("searchbox").closest("div")?.querySelector("kbd")).toBeNull();
  });
});

describe("US-QS-32 · SG-SEARCH-01 the search field shows the search icon at its left", () => {
  it("US-QS-32 · SG-SEARCH-01 the search icon sits inside the field at its left edge and is hidden from assistive technology", () => {
    render(<Harness initial="" />);
    const wrapper = screen.getByRole("searchbox").parentElement as HTMLElement;
    const icon = wrapper.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(icon?.getAttribute("class")).toContain("absolute");
    expect(icon?.getAttribute("class")).toContain("start-3");
  });

  it("US-QS-32 · SG-SEARCH-01 the text keeps clear of the icon: the field has room for it at its start", () => {
    render(<Harness initial="" />);
    expect(screen.getByRole("searchbox").className.split(" ")).toContain("ps-10");
  });

  it("US-QS-32 · SG-SEARCH-01 the icon and the clear control both sit in the field while it holds text", () => {
    render(<Harness initial="Monstera" />);
    const wrapper = screen.getByRole("searchbox").parentElement as HTMLElement;
    expect(wrapper.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Suche leeren" })).toBeTruthy();
  });
});
