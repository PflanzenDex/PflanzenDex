// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { PhotoAction } from "./photo-action";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** A server whose first answer is lost; the keys of the uploads are kept in order (US-QS-03). */
function uploads(lost: number) {
  const keys: string[] = [];
  let left = lost;
  const fetchFn = vi.fn<typeof fetch>(async (_url, init) => {
    keys.push((init?.headers as Record<string, string>)["Idempotency-Key"] ?? "");
    if (left > 0) {
      left -= 1;
      throw new TypeError("Failed to fetch");
    }
    return new Response("{}", { status: 201 });
  });
  vi.stubGlobal("fetch", fetchFn);
  return keys;
}

const photo = (name: string, lastModified: number) =>
  new File(["pixels"], name, { type: "image/jpeg", lastModified });

function pick(container: HTMLElement, file: File) {
  const input = container.querySelector<HTMLInputElement>("input[type=file]");
  if (!input) throw new Error("no file input");
  fireEvent.change(input, { target: { files: [file] } });
}

function renderAction() {
  const access = { api: "http://api", token: async () => "tok" };
  return render(
    <AnnouncerProvider>
      <PhotoAction
        access={access}
        specimenId="s1"
        date="2026-11-20"
        hasPhoto={false}
        onSaved={vi.fn()}
      />
    </AnnouncerProvider>,
  );
}

describe("US-WAC-06 · US-QS-03 the photo upload of a measurement", () => {
  it("US-QS-03 a different file after a lost answer is another write: it gets a key of its own", async () => {
    const keys = uploads(1);
    const { container } = renderAction();
    pick(container, photo("a.jpg", 1));
    await waitFor(() => expect(keys).toHaveLength(1));
    pick(container, photo("b.jpg", 2));
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).not.toBe(keys[0]);
  });

  it("US-QS-03 the same file after a lost answer repeats under its key", async () => {
    const keys = uploads(1);
    const { container } = renderAction();
    const file = photo("a.jpg", 1);
    pick(container, file);
    await waitFor(() => expect(keys).toHaveLength(1));
    pick(container, file);
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).toBe(keys[0]);
  });
});
