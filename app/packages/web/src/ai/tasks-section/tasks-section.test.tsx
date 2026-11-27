// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../shared/data";
import { NewTaskPart, TasksSection } from "./tasks-section";

/** The address of the router: the layer the last control opened (`?sheet=<id>`, US-QS-15). */
function Address() {
  return <output data-testid="address">{useLocation().search}</output>;
}
import { expectOneLoadingStatus } from "@/shared/ui/skeleton.loading-contract";
import { filledIn, hasOwnBorder, isPlain, isTinted } from "@/shared/ui/button.roles";
import table from "../ai.de.json";
import { TasksSkeleton } from "./tasks-section.skeleton";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const PROMPT = "Auftrag aus PflanzenDéx\nAuftrags-Kennung: t1";
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
      <MemoryRouter>
        <TasksSection api="http://api" token={token} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
/** The new-task layer (US-QS-17), and with `list` the task list beside it, as the keeper has them in two layers. */
const showNew = (list = false) =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <NewTaskPart api="http://api" token={token} />
        {list && <TasksSection api="http://api" token={token} />}
      </MemoryRouter>
    </QueryClientProvider>,
  );
/** One section with the address shown, so a test can read the layer its control opened. */
const showWithAddress = (section: "tasks" | "new-task") =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        {section === "tasks" ? (
          <TasksSection api="http://api" token={token} />
        ) : (
          <NewTaskPart api="http://api" token={token} />
        )}
        <Address />
      </MemoryRouter>
    </QueryClientProvider>,
  );
/** The box of an empty state: its line is the heading, its one action the button inside (US-QS-07). */
const emptyBox = async (line: string) =>
  (await screen.findByRole("heading", { level: 3, name: line })).parentElement as HTMLElement;
const actionsOf = (box: HTMLElement) =>
  within(box)
    .getAllByRole("button")
    .map((b) => b.textContent);
const address = () => screen.getByTestId("address").textContent;
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
    showNew();
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
    showNew(true);
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

describe("US-KI-08 FX-81 the empty sheets offer their next step", () => {
  it("US-KI-08 FX-81 'Aufträge' without a task offers 'Auftrag anlegen' when a client is connected", async () => {
    fakeServer([], true);
    const user = userEvent.setup();
    showWithAddress("tasks");
    const box = await emptyBox("Keine Aufträge vorhanden");
    expect(actionsOf(box)).toEqual(["Auftrag anlegen"]);
    await user.click(within(box).getByRole("button", { name: "Auftrag anlegen" }));
    expect(address()).toBe("?sheet=new-task");
  });

  it("US-KI-08 FX-81 'Aufträge' without a task and without a client offers 'KI-Client verbinden', which opens how-to", async () => {
    fakeServer([], false);
    const user = userEvent.setup();
    showWithAddress("tasks");
    const box = await emptyBox("Keine Aufträge vorhanden");
    expect(actionsOf(box)).toEqual(["KI-Client verbinden"]);
    await user.click(within(box).getByRole("button", { name: "KI-Client verbinden" }));
    expect(address()).toBe("?sheet=howto");
  });

  it("US-KI-08 FX-81 'Neuer Auftrag' without a client offers 'KI-Client verbinden' above the disabled 'Auftrag anlegen'", async () => {
    fakeServer([], false);
    const user = userEvent.setup();
    showWithAddress("new-task");
    await screen.findByText(/kein KI-Client verbunden/);
    const connect = screen.getByRole("button", { name: "KI-Client verbinden" });
    const create = screen.getByRole("button", { name: "Auftrag anlegen" }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    expect(connect.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(connect);
    expect(address()).toBe("?sheet=howto");
  });

  it("US-KI-08 FX-81 'Neuer Auftrag' with a connected client offers no 'KI-Client verbinden'", async () => {
    fakeServer([], true);
    showWithAddress("new-task");
    await screen.findByRole("button", { name: "Auftrag anlegen" });
    expect(screen.queryByRole("button", { name: "KI-Client verbinden" })).toBeNull();
  });
});

describe("US-QS-14 issue 1697 · the tasks show their shaped skeleton once", () => {
  it("US-QS-14 issue 1697 · a slow load shows one status with the loading text, and nothing before the delay", () =>
    expectOneLoadingStatus(
      <TasksSkeleton label={table["tasks.loading"]} />,
      table["tasks.loading"],
    ));
});

describe("US-QS-32 the tasks: one line of hint, the rest behind Mehr erfahren (SG-COPY-05, F-0302)", () => {
  it("US-QS-32 F-0302 'Aufträge' says one line; the example, the draft and the 14 days sit behind Mehr erfahren", async () => {
    fakeServer([row()]);
    show();
    const line = await screen.findByText("Ein Auftrag bittet deinen KI-Client um etwas.");
    expect(line.closest("details")).toBeNull();
    const more = line.parentElement?.querySelector("details");
    expect(more?.textContent).toContain("Zum Beispiel ein Artprofil.");
    expect(more?.textContent).toContain("Das Ergebnis kommt als Entwurf");
    expect(more?.textContent).toContain("nach 14 Tagen");
    expect(more?.textContent).not.toContain("Ein Auftrag bittet deinen KI-Client um etwas.");
  });
});

describe("US-QS-32 · SG-BTN-01 the tasks: no outline button (FX-39 sweep 4)", () => {
  it("US-QS-32 · SG-BTN-01 'Zurückziehen' of a task is a plain button, beside the filled 'In KI-Client öffnen'", async () => {
    fakeServer([row()]);
    show();
    const withdraw = await screen.findByRole("button", {
      name: "Artprofil recherchieren: Aloe vera zurückziehen",
    });
    expect(isPlain(withdraw)).toBe(true);
    expect(hasOwnBorder(withdraw)).toBe(false);
  });

  it("US-QS-32 · SG-BTN-01 'Auftrag als Text anzeigen' is a tinted button without a border, beside the filled 'Auftrag anlegen'", async () => {
    fakeServer([], true);
    const { container } = showNew();
    const preview = await screen.findByRole("button", { name: "Auftrag als Text anzeigen" });
    expect(isTinted(preview)).toBe(true);
    expect(hasOwnBorder(preview)).toBe(false);
    expect(filledIn(container)).toEqual([screen.getByRole("button", { name: "Auftrag anlegen" })]);
  });
});
