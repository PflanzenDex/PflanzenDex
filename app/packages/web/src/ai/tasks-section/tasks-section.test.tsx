// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../kernel";
import { TasksSection } from "./tasks-section";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const PROMPT = "Auftrag aus PflanzenDex\nAuftrags-Kennung: t1";
const row = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  type: "species_profile",
  title: "Artprofil recherchieren",
  reference: "Aloe vera",
  label: "Aloe vera",
  status: "open",
  clientName: null,
  createdAt: "2026-10-10T08:00:00.000Z",
  prompt: PROMPT,
  ...over,
});

function fakeServer(rows: Record<string, unknown>[], clientConnected = true) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const method = init?.method ?? "GET";
      const path = new URL(String(url)).pathname;
      if (method === "GET") return response(200, { clientConnected, tasks: rows });
      calls.push(`${method} ${path}`);
      return response(200, path.endsWith("preview") ? { prompt: PROMPT } : {});
    }),
  );
  return calls;
}
const show = () =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <TasksSection api="http://api" token={token} />
    </QueryClientProvider>,
  );
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-KI-08 tasks to the AI client", () => {
  it("US-KI-08 shows type, reference, status and the text of an open task before copying", async () => {
    fakeServer([row(), row({ id: "t2", status: "in_progress", clientName: "Claude" })]);
    show();
    const list = await screen.findByRole("list", { name: "KI-Aufträge" });
    expect(list.textContent).toContain("Artprofil recherchieren: Aloe vera");
    expect(list.textContent).toContain("Offen");
    expect(list.textContent).toContain("In Arbeit");
    expect(list.textContent).toContain("Claude arbeitet daran.");
    expect(list.textContent).toContain("Auftrags-Kennung: t1");
  });

  it("US-KI-08 'In KI-Client öffnen' puts the prompt on the clipboard", async () => {
    fakeServer([row()]);
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    show();
    await user.click(
      await screen.findByRole("button", {
        name: "Artprofil recherchieren: Aloe vera in KI-Client öffnen",
      }),
    );
    expect(writeText).toHaveBeenCalledWith(PROMPT);
    expect((await screen.findByRole("status")).textContent).toContain("Zwischenablage");
  });

  it("US-KI-08 without a connected client it says so, blocks the task and still offers the text", async () => {
    const calls = fakeServer([], false);
    const user = userEvent.setup();
    show();
    expect(await screen.findByText(/kein KI-Client verbunden/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Auftrag anlegen" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await user.type(screen.getByLabelText("Name der Art"), "Aloe vera");
    await user.click(screen.getByRole("button", { name: "Auftrag als Text anzeigen" }));
    expect(await screen.findByText(/Auftrags-Kennung: t1/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Auftrag als Text kopieren" })).toBeTruthy();
    expect(calls).toEqual(["POST /ai/tasks/preview"]);
  });

  it("US-KI-08 creates and withdraws a task by the keeper's action", async () => {
    const calls = fakeServer([row()]);
    const user = userEvent.setup();
    show();
    await user.type(await screen.findByLabelText("Name der Art"), "Haworthia");
    await user.click(screen.getByRole("button", { name: "Auftrag anlegen" }));
    await user.click(
      await screen.findByRole("button", {
        name: "Artprofil recherchieren: Aloe vera zurückziehen",
      }),
    );
    expect(calls).toEqual(["POST /ai/tasks", "POST /ai/tasks/t1/cancel"]);
  });
});
