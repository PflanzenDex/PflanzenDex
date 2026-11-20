// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpeciesStep, type SpeciesLookup } from "./species-step";

afterEach(cleanup);

const lookup: SpeciesLookup = {
  search: vi.fn(() => Promise.resolve({ ok: true as const, value: [] })),
  load: vi.fn(),
};

function Step() {
  const [text, setText] = useState("");
  return (
    <SpeciesStep
      lookup={lookup}
      api="/api"
      token={() => Promise.resolve("t")}
      text={text}
      onText={setText}
      species={null}
      onPick={() => undefined}
      onCatalog={() => undefined}
    />
  );
}

describe("SpeciesStep search field (US-ONB-01, US-QS-24, issue 1094)", () => {
  it("US-ONB-01 offers 'Suche leeren' only with text; it clears the field and refocuses it", async () => {
    const user = userEvent.setup();
    render(<Step />);
    const field = screen.getByLabelText("Art") as HTMLInputElement;
    expect(screen.queryByRole("button", { name: "Suche leeren" })).toBeNull();
    await user.type(field, "Monstera");
    await user.click(screen.getByRole("button", { name: "Suche leeren" }));
    expect(field.value).toBe("");
    expect(document.activeElement).toBe(field);
  });
});

function StepWithCatalog(props: { onCatalog: () => void }) {
  const [text, setText] = useState("");
  return (
    <SpeciesStep
      lookup={lookup}
      api="/api"
      token={() => Promise.resolve("t")}
      text={text}
      onText={setText}
      species={null}
      onPick={() => undefined}
      onCatalog={props.onCatalog}
    />
  );
}

describe("US-QS-32 · issue 1964 the species field of the first plant", () => {
  it("US-QS-32 · issue 1964 the field is named 'Art' and shows the example placeholder", () => {
    render(<Step />);
    const field = screen.getByLabelText("Art") as HTMLInputElement;
    expect(field.getAttribute("placeholder")).toBe("z. B. Monstera");
  });

  it("US-QS-32 · issue 1964 a name without a hit says one line with the query, and 'Art vorschlagen' sits below it", async () => {
    const onCatalog = vi.fn();
    render(<StepWithCatalog onCatalog={onCatalog} />);
    await userEvent.type(screen.getByLabelText("Art"), "Zzz");
    const line = "Keine Art für „Zzz“ gefunden.";
    expect(await screen.findByText(line)).toBeTruthy();
    // The screen reader hears the same line: the status element is the line itself.
    expect(screen.getByRole("status").textContent).toBe(line);
    await userEvent.click(screen.getByRole("button", { name: "Art vorschlagen" }));
    expect(onCatalog).toHaveBeenCalledTimes(1);
  });
});
