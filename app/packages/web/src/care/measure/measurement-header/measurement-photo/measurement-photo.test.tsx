// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MeasurementPhoto } from "./measurement-photo";

const calls: { url: string; auth: string | undefined }[] = [];
const stub = (status: number, body: BodyInit | null = new Uint8Array([1, 2, 3])) =>
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      calls.push({
        url: String(url),
        auth: (init?.headers as Record<string, string> | undefined)?.["Authorization"],
      });
      return status === 200
        ? new Response(body, { status, headers: { "content-type": "image/webp" } })
        : new Response(
            JSON.stringify({
              error: { code: "measurement.photo_not_found", text: "raw server text" },
            }),
            { status },
          );
    }),
  );
const show = () =>
  render(
    <MeasurementPhoto
      api="http://api"
      token={async () => "tok"}
      specimenId="e1"
      measurementId="m1"
      photo="7c1e.webp"
      date="2026-10-01"
    />,
  );

beforeEach(() => {
  calls.length = 0;
  URL.createObjectURL = vi.fn(() => "blob:photo");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-WAC-05 the photo of a measurement in the view", () => {
  it("loads the photo with the token (private, P-05) and shows it with alternative text", async () => {
    stub(200);
    show();
    const img = await screen.findByRole("img", { name: "Foto der Messung vom 01.10.2026" });
    expect(img.getAttribute("src")).toBe("blob:photo");
    expect(calls[0]).toEqual({
      url: "http://api/specimens/e1/measurements/m1/photo?v=7c1e",
      auth: "Bearer tok",
    });
  });

  it("shows the German text of the error code when the photo cannot be loaded (P-10)", async () => {
    stub(404);
    show();
    expect(await screen.findByText("Zu dieser Messung gibt es kein Foto.")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("says that it is loading", () => {
    stub(200);
    show();
    expect(screen.getByRole("status").textContent).toContain("Foto wird geladen");
  });
});

describe("NFR-12 the sizes of a measurement photo", () => {
  const showWith = (compact: boolean) =>
    render(
      <MeasurementPhoto
        api="http://api"
        token={async () => "tok"}
        specimenId="e1"
        measurementId="m1"
        photo="7c1e.webp"
        date="2026-10-01"
        compact={compact}
      />,
    );

  it("NFR-12 a compact picture of the history (a list entry) asks the thumbnail", async () => {
    stub(200);
    showWith(true);
    await screen.findByRole("img", { name: "Foto der Messung vom 01.10.2026" });
    expect(calls[0]?.url).toBe("http://api/specimens/e1/measurements/m1/photo?v=7c1e&size=thumb");
  });

  it("NFR-12 the picture of the measure page stays the stored copy", async () => {
    stub(200);
    showWith(false);
    await screen.findByRole("img", { name: "Foto der Messung vom 01.10.2026" });
    expect(calls[0]?.url).toBe("http://api/specimens/e1/measurements/m1/photo?v=7c1e");
  });

  it("NFR-12 US-WAC-06 a replaced photo is requested at its new address and shows at once", async () => {
    stub(200);
    const view = render(
      <MeasurementPhoto
        api="http://api"
        token={async () => "tok"}
        specimenId="e1"
        measurementId="m1"
        photo="first.webp"
        date="2026-10-01"
        compact
      />,
    );
    await screen.findByRole("img", { name: "Foto der Messung vom 01.10.2026" });
    URL.createObjectURL = vi.fn(() => "blob:replaced");
    // The list reloads after the upload and carries the new object name of the measurement.
    view.rerender(
      <MeasurementPhoto
        api="http://api"
        token={async () => "tok"}
        specimenId="e1"
        measurementId="m1"
        photo="second.webp"
        date="2026-10-01"
        compact
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("img", { name: "Foto der Messung vom 01.10.2026" }).getAttribute("src"),
      ).toBe("blob:replaced"),
    );
    expect(calls.map((c) => c.url)).toEqual([
      "http://api/specimens/e1/measurements/m1/photo?v=first&size=thumb",
      "http://api/specimens/e1/measurements/m1/photo?v=second&size=thumb",
    ]);
  });
});
