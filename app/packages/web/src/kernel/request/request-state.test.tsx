// @vitest-environment jsdom
import { cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestState } from "@/components/shared/request-state";
import { LoadFrame, useClearOnSignOut, useWriteAction, useInvalidate, type Response } from "..";

const token = async () => "tok";
const fail = (code: string, text: string): Response<string[]> => ({
  ok: false,
  error: { code, text },
});
const ok = (value: string[]): Response<string[]> => ({ ok: true, value });

afterEach(cleanup);

function Frame(props: {
  load: () => Promise<Response<string[]>>;
  token?: () => Promise<string | undefined>;
}) {
  return (
    <LoadFrame
      queryKey={["test", "list"]}
      token={props.token ?? token}
      load={props.load}
      loadingText="Liste wird geladen …"
      empty={{
        title: "Noch nichts da",
        description: "Lege etwas an.",
        isEmpty: (v) => v.length === 0,
      }}
    >
      {(rows) => (
        <ul>
          {rows.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </LoadFrame>
  );
}

describe("US-QS-07 · DS-09 RequestState", () => {
  it("US-QS-07 · DS-09 pending shows the skeleton and nothing else", () => {
    render(
      <RequestState status="pending" skeleton={<p role="status">lädt</p>} onRetry={() => undefined}>
        <p>Inhalt</p>
      </RequestState>,
    );
    expect(screen.getByRole("status").textContent).toBe("lädt");
    expect(screen.queryByText("Inhalt")).toBeNull();
  });

  it("US-QS-07 · DS-09 error shows the text and 'Erneut versuchen' that retries", async () => {
    const onRetry = vi.fn();
    render(
      <RequestState
        status="error"
        errorText="Es ging etwas schief."
        skeleton={null}
        onRetry={onRetry}
      >
        <p>Inhalt</p>
      </RequestState>,
    );
    expect((await screen.findByRole("alert")).textContent).toContain("Es ging etwas schief.");
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("US-QS-07 · DS-09 empty shows the empty state, not the children", () => {
    render(
      <RequestState status="empty" skeleton={null} onRetry={() => undefined} empty={<p>Leer</p>}>
        <p>Inhalt</p>
      </RequestState>,
    );
    expect(screen.getByText("Leer")).toBeTruthy();
    expect(screen.queryByText("Inhalt")).toBeNull();
  });

  it("US-QS-07 · DS-09 offline keeps the children and adds the note", () => {
    render(
      <RequestState status="ready" offline skeleton={null} onRetry={() => undefined}>
        <p>Inhalt</p>
      </RequestState>,
    );
    expect(screen.getByText("Inhalt")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Offline - zuletzt geladene Daten");
  });
});

describe("US-QS-07 · DS-09 LoadFrame on the data layer", () => {
  it("US-QS-07 · DS-09 pending shows the loading text, then the rows", async () => {
    render(<Frame load={async () => ok(["Efeu"])} />);
    expect(screen.getByRole("status").textContent).toContain("Liste wird geladen");
    expect(await screen.findByText("Efeu")).toBeTruthy();
  });

  it("US-QS-07 · DS-09 a domain error shows its text and 'Erneut versuchen' loads again", async () => {
    const load = vi
      .fn<() => Promise<Response<string[]>>>()
      .mockResolvedValueOnce(fail("server.error", "Der Server antwortet nicht."))
      .mockResolvedValueOnce(ok(["Efeu"]));
    render(<Frame load={load} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Der Server antwortet nicht.");
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByText("Efeu")).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("US-QS-07 · DS-09 no rows show the empty state with its text", async () => {
    render(<Frame load={async () => ok([])} />);
    expect(await screen.findByText("Noch nichts da")).toBeTruthy();
    expect(screen.getByText("Lege etwas an.")).toBeTruthy();
  });

  it("US-QS-07 · DS-09 without sign-in nothing is queried and the user is asked to sign in", async () => {
    const load = vi.fn(async () => ok([]));
    render(<Frame load={load} token={async () => undefined} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Bitte melde dich neu an.");
    expect(load).not.toHaveBeenCalled();
  });

  it("US-QS-07 · DS-09 offline after an earlier load shows the cached rows with the note", async () => {
    const load = vi
      .fn<() => Promise<Response<string[]>>>()
      .mockResolvedValueOnce(ok(["Efeu"]))
      .mockResolvedValue(fail("network.not_reachable", "Der Server ist nicht erreichbar."));
    function Toggle() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button onClick={() => setOpen((o) => !o)}>umschalten</button>
          {open && <Frame load={load} />}
        </>
      );
    }
    render(<Toggle />);
    expect(await screen.findByText("Efeu")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "umschalten" }));
    await userEvent.click(screen.getByRole("button", { name: "umschalten" }));
    expect(await screen.findByText("Offline - zuletzt geladene Daten")).toBeTruthy();
    expect(screen.getByText("Efeu")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("US-QS-07 · DS-09 offline without cached data shows the error, not an empty list", async () => {
    render(
      <Frame
        load={async () => fail("network.not_reachable", "Der Server ist nicht erreichbar.")}
      />,
    );
    expect((await screen.findByRole("alert")).textContent).toContain("nicht erreichbar");
    expect(screen.queryByText("Offline - zuletzt geladene Daten")).toBeNull();
  });
});

describe("US-QS-07 · DS-09 mutation invalidates the list", () => {
  it("US-QS-07 · DS-09 a successful write refreshes the list without a reload and says so", async () => {
    let rows = ["Efeu"];
    const load = async () => ok([...rows]);
    function Page() {
      const invalidate = useInvalidate(["test"]);
      const write = useWriteAction(token, invalidate);
      return (
        <>
          <button
            onClick={() =>
              void write.run(async () => {
                rows = [...rows, "Farn"];
                return { ok: true, value: null };
              }, "Gespeichert.")
            }
          >
            Hinzufügen
          </button>
          {write.message && <p>{write.message}</p>}
          <Frame load={load} />
        </>
      );
    }
    render(<Page />);
    expect(await screen.findByText("Efeu")).toBeTruthy();
    expect(screen.queryByText("Farn")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));
    await waitFor(() => expect(screen.getByText("Farn")).toBeTruthy());
    expect(screen.getByText("Gespeichert.")).toBeTruthy();
  });

  it("US-QS-07 · DS-09 a refused write stays visible and nothing is dropped silently (P-10)", async () => {
    function Page() {
      const invalidate = useInvalidate(["test"]);
      const write = useWriteAction(token, invalidate);
      return (
        <>
          <button
            onClick={() =>
              void write.run(
                async () => ({
                  ok: false,
                  error: {
                    code: "network.not_reachable",
                    text: "Der Server ist nicht erreichbar.",
                  },
                }),
                "Gespeichert.",
              )
            }
          >
            Senden
          </button>
          {write.error && <p role="alert">{write.error.text}</p>}
        </>
      );
    }
    render(<Page />);
    await userEvent.click(screen.getByRole("button", { name: "Senden" }));
    expect((await screen.findByRole("alert")).textContent).toContain("nicht erreichbar");
  });
});

describe("US-QS-07 · DS-09 cache and sign-out", () => {
  it("US-QS-07 · DS-09 sign-out drops the cached data so the next account never sees it (P-04)", () => {
    const { result, rerender } = renderHook(
      ({ signedIn }) => {
        useClearOnSignOut(signedIn);
        return useQueryClient();
      },
      { initialProps: { signedIn: true } },
    );
    result.current.setQueryData(["test", "list"], ["Efeu"]);
    rerender({ signedIn: true });
    expect(result.current.getQueryData(["test", "list"])).toEqual(["Efeu"]);
    rerender({ signedIn: false });
    expect(result.current.getQueryData(["test", "list"])).toBeUndefined();
  });
});
