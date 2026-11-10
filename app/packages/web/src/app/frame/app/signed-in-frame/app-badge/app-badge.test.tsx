// @vitest-environment jsdom
import { Suspense, type ReactNode } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient, useInvalidate } from "@/shared/data";
import { ToastProvider } from "@/shared/patterns/states/toast/toast-provider/toast-provider";
import { WaterAction } from "@/monitoring";
import { AppBadge } from "./app-badge";

const API = "http://api";
const token = async () => "tok";
const OCCASIONS = ["phase", "treatment", "measurement", "watering", "swap", "friends", "equipment"];

type Due = {
  specimenId: string;
  name: string;
  intervalDays: number;
  lastWateredOn: null;
  daysSince: number;
};
type Server = {
  due: Due[];
  treatments: { status: { kind: "overdue" | "due" } }[];
  hints: { id: string }[];
  calmMode: boolean | "error";
  reminders: boolean;
  requested: string[];
};

const due = (specimenId: string, name: string): Due => ({
  specimenId,
  name,
  intervalDays: 3,
  lastWateredOn: null,
  daysSince: 4,
});

/** The answers of the requests that `Heute` and the badge make; the state can change between requests. */
function server(initial: Partial<Server> = {}): Server {
  const state: Server = {
    due: [],
    treatments: [],
    hints: [],
    calmMode: false,
    reminders: true,
    requested: [],
    ...initial,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const { pathname } = new URL(String(url));
      const method = init?.method ?? "GET";
      state.requested.push(`${method} ${pathname}`);
      const json = (status: number, body: unknown) =>
        new Response(JSON.stringify(body), { status });
      if (method === "POST" && pathname === "/watering") {
        const body = JSON.parse(String(init?.body)) as { specimenIds: string[] };
        state.due = state.due.filter((row) => !body.specimenIds.includes(row.specimenId));
        return json(200, {});
      }
      switch (pathname) {
        case "/watering/due":
          return json(200, { due: state.due });
        case "/treatments":
          return json(200, { treatments: state.treatments });
        case "/specimens/hints":
          return json(200, { hints: state.hints });
        case "/locations":
          return json(200, { locations: [] });
        case "/account/profile":
          return json(200, {
            notifications: Object.fromEntries(OCCASIONS.map((o) => [o, state.reminders])),
          });
        case "/achievements/settings":
          return state.calmMode === "error"
            ? json(500, { error: { code: "system.unexpected", text: "x" } })
            : json(200, { calmMode: state.calmMode });
        default:
          return json(404, { error: { code: "system.unexpected", text: "x" } });
      }
    }),
  );
  return state;
}

/** The browser's badge API as a test double; `refuse` makes every call reject. */
function badgeApi({ refuse = false }: { refuse?: boolean } = {}) {
  const set = vi.fn(() => (refuse ? Promise.reject(new Error("refused")) : Promise.resolve()));
  const clear = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, "setAppBadge", { value: set, configurable: true });
  Object.defineProperty(navigator, "clearAppBadge", { value: clear, configurable: true });
  return { set, clear };
}

/**
 * A stand-in for "Erledigt" of the open treatments: it refreshes the prefix the real tick-off refreshes after every answer
 * (`useInvalidate(TREATMENTS)` in `open-treatments.tsx`), so the open count refetches the same way.
 */
function TreatmentLogged() {
  const again = useInvalidate(["care", "treatments"]);
  return (
    <button type="button" onClick={again}>
      Erledigt
    </button>
  );
}

function show(extra?: ReactNode) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <AppBadge api={API} token={token} />
        <Suspense fallback={null}>
          <WaterAction api={API} token={token} specimen={{ id: "s1", name: "Aloe" }} />
        </Suspense>
        {extra}
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** Lets the pending requests of the badge finish, so that a silent badge is really silent. */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "setAppBadge");
  Reflect.deleteProperty(navigator, "clearAppBadge");
});

describe("US-QS-29 the app icon shows the due total of Heute", () => {
  it("US-QS-29 shows the total of the three categories of Heute when the app opens", async () => {
    server({
      due: [due("s1", "Aloe"), due("s2", "Ficus")],
      treatments: [
        { status: { kind: "overdue" } },
        { status: { kind: "due" } },
        { status: { kind: "due" } },
      ],
      hints: [{ id: "h1" }],
    });
    const badge = badgeApi();
    show();
    await waitFor(() => expect(badge.set).toHaveBeenLastCalledWith(6));
    expect(badge.clear).not.toHaveBeenCalled();
  });

  it("US-QS-29 shows the new total after a task is logged with Gießen", async () => {
    const state = server({ due: [due("s1", "Aloe"), due("s2", "Ficus")] });
    const badge = badgeApi();
    show();
    await waitFor(() => expect(badge.set).toHaveBeenLastCalledWith(2));
    await userEvent.click(await screen.findByRole("button", { name: "Gießen: Aloe" }));
    await waitFor(() => expect(badge.set).toHaveBeenLastCalledWith(1));
    expect(state.due.map((row) => row.specimenId)).toEqual(["s2"]);
  });

  it("US-QS-29 shows the new total after a treatment is logged (the treatments prefix refreshes the count)", async () => {
    const state = server({
      treatments: [{ status: { kind: "due" } }, { status: { kind: "overdue" } }],
    });
    const badge = badgeApi();
    show(<TreatmentLogged />);
    await waitFor(() => expect(badge.set).toHaveBeenLastCalledWith(2));
    state.treatments = [{ status: { kind: "overdue" } }];
    await userEvent.click(screen.getByRole("button", { name: "Erledigt" }));
    await waitFor(() => expect(badge.set).toHaveBeenLastCalledWith(1));
  });

  it("US-QS-29 clears the icon at a total of 0 and sets no 0", async () => {
    server({});
    const badge = badgeApi();
    show();
    await waitFor(() => expect(badge.clear).toHaveBeenCalled());
    expect(badge.set).not.toHaveBeenCalled();
  });

  it("US-QS-29 shows no number and clears the icon in calm mode (US-ACH-08)", async () => {
    server({ calmMode: true, due: [due("s1", "Aloe"), due("s2", "Ficus")] });
    const badge = badgeApi();
    show();
    await waitFor(() => expect(badge.clear).toHaveBeenCalled());
    expect(badge.set).not.toHaveBeenCalled();
  });

  it("US-QS-29 shows no number and clears the icon when every reminder switch is off (P-12)", async () => {
    server({ reminders: false, due: [due("s1", "Aloe")] });
    const badge = badgeApi();
    show();
    await waitFor(() => expect(badge.clear).toHaveBeenCalled());
    expect(badge.set).not.toHaveBeenCalled();
  });

  it("US-QS-29 sets no number and leaves the icon as it is while calm mode cannot be read (P-08)", async () => {
    const state = server({ calmMode: "error", due: [due("s1", "Aloe")] });
    const badge = badgeApi();
    show();
    await waitFor(() => expect(state.requested).toContain("GET /achievements/settings"));
    await waitFor(() => expect(state.requested).toContain("GET /watering/due"));
    await settle();
    expect(badge.set).not.toHaveBeenCalled();
    expect(badge.clear).not.toHaveBeenCalled();
  });

  it("US-QS-29 without the badge API nothing happens and no error shows", async () => {
    const state = server({ due: [due("s1", "Aloe")] });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    show();
    await waitFor(() => expect(state.requested).toContain("GET /watering/due"));
    await settle();
    expect(warn).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("US-QS-29 a refused badge call goes to the console and shows nothing to the keeper (P-10)", async () => {
    server({ due: [due("s1", "Aloe")] });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const badge = badgeApi({ refuse: true });
    show();
    await waitFor(() => expect(badge.set).toHaveBeenCalled());
    await settle();
    expect(warn).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("US-QS-29 clears the icon when the signed-in shell ends, so no account's number stays (P-04)", async () => {
    server({ due: [due("s1", "Aloe"), due("s2", "Ficus")] });
    const badge = badgeApi();
    const view = show();
    await waitFor(() => expect(badge.set).toHaveBeenLastCalledWith(2));
    view.unmount();
    expect(badge.clear).toHaveBeenCalled();
  });
});
