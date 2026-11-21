// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { FormBar } from "@/shared/ui/button/form-bar/form-bar";
import { LayerHost, LayerOpener, LayerSheet, useUnsavedInput } from "./layer-sheet";

beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});

afterEach(cleanup);

let search = "";
function Probe() {
  search = useLocation().search;
  return null;
}

/** A form in a layer with the bar of its actions, and typed input that it reports to the layer (US-QS-32). */
function NoteForm() {
  const [text, setText] = useState("");
  useUnsavedInput(text !== "");
  return (
    <form id="note-form" aria-label="Notiz erfassen" onSubmit={(event) => event.preventDefault()}>
      <label>
        Text
        <input value={text} onChange={(event) => setText(event.target.value)} />
      </label>
      <FormBar formId="note-form">Sichern</FormBar>
    </form>
  );
}

function renderLayer() {
  return render(
    <MemoryRouter initialEntries={["/start"]}>
      <Probe />
      <LayerHost>
        <LayerOpener id="notiz">Notiz</LayerOpener>
        <LayerSheet id="notiz" title="Notiz">
          <NoteForm />
        </LayerSheet>
      </LayerHost>
    </MemoryRouter>,
  );
}

const QUESTION = { name: "Eingabe verwerfen?" };

async function open() {
  await userEvent.click(screen.getByRole("button", { name: "Notiz" }));
  return screen.findByRole("dialog", { name: "Notiz" });
}

describe("US-QS-32 · SG-FORM-06 Abbrechen of the bar leaves the layer the way its close does", () => {
  it("US-QS-32 Abbrechen with typed input asks Eingabe verwerfen? and keeps the layer and the input until the person decides", async () => {
    setViewportWidth(360);
    renderLayer();
    const sheet = await open();
    await userEvent.type(within(sheet).getByLabelText("Text"), "Basilikum");
    await userEvent.click(await within(sheet).findByRole("button", { name: "Abbrechen" }));
    const question = await screen.findByRole("dialog", QUESTION);
    expect(search).toContain("sheet=notiz");
    await userEvent.click(within(question).getByRole("button", { name: "Weiter bearbeiten" }));
    await waitFor(() => expect(screen.queryByRole("dialog", QUESTION)).toBeNull());
    expect((screen.getByLabelText("Text") as HTMLInputElement).value).toBe("Basilikum");
    await userEvent.click(within(sheet).getByRole("button", { name: "Abbrechen" }));
    await userEvent.click(
      within(await screen.findByRole("dialog", QUESTION)).getByRole("button", {
        name: "Eingabe verwerfen",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Notiz" })).toBeNull());
    expect(search).toBe("");
  });

  it("US-QS-32 Abbrechen without typed input closes the layer at once and asks nothing", async () => {
    setViewportWidth(360);
    renderLayer();
    const sheet = await open();
    await userEvent.click(await within(sheet).findByRole("button", { name: "Abbrechen" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Notiz" })).toBeNull());
    expect(screen.queryByRole("dialog", QUESTION)).toBeNull();
    expect(search).toBe("");
  });

  it("US-QS-32 from 1024 px the pane draws the pair as a row and Abbrechen asks as well", async () => {
    setViewportWidth(1280);
    renderLayer();
    await userEvent.click(screen.getByRole("button", { name: "Notiz" }));
    const pane = await screen.findByRole("complementary", { name: "Notiz" });
    const cancel = within(pane).getByRole("button", { name: "Abbrechen" });
    const save = within(pane).getByRole("button", { name: "Sichern" });
    expect(cancel.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect((cancel.parentElement as HTMLElement).className).not.toMatch(/\b(sticky|fixed)\b/);
    // From md the pair stands after the last field (US-QS-32, SG-SHEET-04).
    expect(
      within(pane).getByLabelText("Text").compareDocumentPosition(cancel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    await userEvent.type(within(pane).getByLabelText("Text"), "Basilikum");
    await userEvent.click(cancel);
    expect(await screen.findByRole("dialog", QUESTION)).toBeTruthy();
  });
});
