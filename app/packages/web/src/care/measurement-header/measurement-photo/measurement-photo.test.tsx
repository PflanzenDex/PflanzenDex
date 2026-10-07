// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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
        ? new Response(body, { status, headers: { "content-type": "image/jpeg" } })
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
      url: "http://api/specimens/e1/measurements/m1/photo",
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
