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
    const field = screen.getByLabelText("Name der Pflanze") as HTMLInputElement;
    expect(screen.queryByRole("button", { name: "Suche leeren" })).toBeNull();
    await user.type(field, "Monstera");
    await user.click(screen.getByRole("button", { name: "Suche leeren" }));
    expect(field.value).toBe("");
    expect(document.activeElement).toBe(field);
  });
});
