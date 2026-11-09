// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LargePicture } from "./large-picture";

const TITLE = "Geigenfeige (Ficus lyrata)";
const ACCESS = { api: "http://api", token: async () => "tok" };
const PATH = "/wishes/w1/image";
const SOURCE = "Quelle: Anna Beispiel · Lizenz: CC BY-SA 4.0";

describe("US-WUN-06 the large view of a stored picture", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:full");
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const view = (onClose = vi.fn()) => (
    <LargePicture access={ACCESS} path={PATH} title={TITLE} sourceLine={SOURCE} onClose={onClose} />
  );

  it("says that the full copy is loading while it is requested (P-10)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => new Promise<Response>(() => undefined)),
    );
    render(view());
    await screen.findByRole("dialog", { name: `Bild von ${TITLE}` });
    // The status shows after the delay of DS-57 (issue 1726); the request never answers, so it stays.
    expect((await screen.findByRole("status")).textContent).toBe("Bild wird geladen …");
  });

  it("names the failure with the German text of its code (P-10)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(
        async () =>
          new Response(JSON.stringify({ error: { code: "wish.image_not_found", text: "raw" } }), {
            status: 404,
          }),
      ),
    );
    render(view());
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/gibt es bei Wikimedia Commons nicht/);
    expect(screen.queryByText("raw")).toBeNull();
  });

  it("shows the full copy with its alternative text and keeps the source and license under it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response(new Uint8Array([2]))),
    );
    render(view());
    const img = await screen.findByRole("img", { name: `Bild von ${TITLE}` });
    expect(img.getAttribute("src")).toBe("blob:full");
    expect(screen.getByText(SOURCE)).toBeTruthy();
  });

  it("the close button calls onClose, so the owner can unmount the view", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response(new Uint8Array([2]))),
    );
    const onClose = vi.fn();
    render(view(onClose));
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
