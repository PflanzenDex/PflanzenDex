// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeeperStyleSection } from "./keeper-style";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";

function fakeServer(initial: { style: string; chosen: boolean }, put?: () => Promise<Response>) {
  const puts: { body: Record<string, unknown>; key: string | undefined }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path !== "/onboarding/style") return response(404, {});
      if (init?.method !== "PUT") return response(200, initial);
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      puts.push({ body, key: (init.headers as Record<string, string>)["Idempotency-Key"] });
      return put ? put() : response(200, { style: body["style"], chosenOn: "2026-10-18" });
    }),
  );
  return puts;
}
const show = () => render(<KeeperStyleSection api="http://api" token={token} />);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-ONB-03 keeper style in the profile", () => {
  it("US-ONB-03 shows the stored style as one of two answers, without level or rank", async () => {
    fakeServer({ style: "many", chosen: true });
    show();
    const select = await screen.findByRole<HTMLSelectElement>("combobox", {
      name: "Wie nutzt du die App?",
    });
    expect(select.value).toBe("many");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Ich pflege ein paar Pflanzen",
      "Ich verwalte viel, zeig mir alles",
    ]);
    expect(screen.queryByText(/Level|Rang|Stufe/i)).toBeNull();
  });

  it("US-ONB-03 one tap switches the style at once with an Idempotency-Key and says what changed", async () => {
    const puts = fakeServer({ style: "few", chosen: true });
    const user = userEvent.setup();
    show();
    await user.selectOptions(await screen.findByRole("combobox"), "many");
    expect((await screen.findByRole("status")).textContent).toBe("Alles ist jetzt offen.");
    expect(puts).toHaveLength(1);
    expect(puts[0]?.body).toMatchObject({ style: "many" });
    expect(typeof puts[0]?.body["timeZone"]).toBe("string");
    expect(puts[0]?.key).toBeTruthy();
    expect(screen.getByRole<HTMLSelectElement>("combobox").value).toBe("many");
    expect(screen.getByText(/bleibt offen/)).toBeTruthy();
  });

  it("US-QS-32 SG-COPY-05 one line of hint under the style; the rest sits behind Mehr erfahren and does not repeat it", async () => {
    fakeServer({ style: "few", chosen: true });
    show();
    await screen.findByRole("combobox");
    const line = screen.getByText("Du kannst das jederzeit ändern.");
    expect(line.closest("details")).toBeNull();
    const more = screen.getByText("Was du schon geöffnet hast, bleibt offen.").closest("details");
    expect(more).not.toBeNull();
    expect(more?.textContent).toContain("Neue Funktionen zeigt die App dir nach und nach.");
    expect(more?.textContent).not.toContain("Du kannst das jederzeit ändern.");
    expect(screen.getByText("Mehr erfahren")).toBeTruthy();
  });

  it("US-QS-32 SG-COPY-05 the explanation behind Mehr erfahren follows the chosen style", async () => {
    fakeServer({ style: "many", chosen: true });
    show();
    await screen.findByRole("combobox");
    const more = screen.getByText("Was du schon geöffnet hast, bleibt offen.").closest("details");
    expect(more?.textContent).toContain("Alles ist sofort offen, ohne Hinweise.");
    expect(more?.textContent).not.toContain("Neue Funktionen zeigt die App");
  });

  it("US-ONB-03 a refusal stays visible and the stored style stays selected (P-10)", async () => {
    fakeServer({ style: "few", chosen: true }, () =>
      response(400, { error: { code: "input.invalid", text: "x" } }),
    );
    const user = userEvent.setup();
    show();
    await user.selectOptions(await screen.findByRole("combobox"), "many");
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole<HTMLSelectElement>("combobox").value).toBe("few");
  });
});

/**
 * A style API that holds each PUT until the test lets it answer, and counts the reads of the style, so the test can wait
 * for the refresh that a save starts (US-QS-32).
 */
function heldStyleApi(initial: { style: string; chosen: boolean }) {
  const puts: Record<string, unknown>[] = [];
  const answers: (() => void)[] = [];
  let reads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path !== "/onboarding/style") return response(404, {});
      if (init?.method !== "PUT") {
        reads += 1;
        return response(200, initial);
      }
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      puts.push(body);
      await new Promise<void>((done) => answers.push(done));
      return response(200, { style: body["style"], chosenOn: "2026-10-18" });
    }),
  );
  return {
    puts,
    reads: () => reads,
    /** Waits until a PUT is on its way, then lets the oldest one answer. */
    answerNext: async () => {
      await vi.waitFor(() => expect(answers.length).toBeGreaterThan(0));
      answers.shift()?.();
    },
  };
}

/**
 * One rendering update of the browser. A control that becomes disabled while it has the focus loses the focus at the next
 * rendering update (jsdom runs that focus fixup on a 16 ms tick), so a focus check waits for one.
 */
const renderingUpdate = () => new Promise<void>((done) => setTimeout(done, 50));

describe("US-QS-32 · the settings select keeps its focus while a pick saves", () => {
  it("US-QS-32 · F-0048 the select keeps the focus while the pick saves and after the stored style is read again", async () => {
    const api = heldStyleApi({ style: "few", chosen: true });
    const user = userEvent.setup();
    show();
    const select = await screen.findByRole<HTMLSelectElement>("combobox", {
      name: "Wie nutzt du die App?",
    });

    select.focus();
    await user.selectOptions(select, "many");
    await vi.waitFor(() => expect(api.puts).toHaveLength(1));
    await renderingUpdate();
    expect(document.activeElement).toBe(select);

    await api.answerNext();
    expect((await screen.findByRole("status")).textContent).toBe("Alles ist jetzt offen.");
    // The save refreshes the key ["onboarding"]: the style is read again, and the same select stays on the screen.
    await vi.waitFor(() => expect(api.reads()).toBe(2));
    await renderingUpdate();
    expect(screen.getByRole("combobox", { name: "Wie nutzt du die App?" })).toBe(select);
    expect(document.activeElement).toBe(select);

    await user.selectOptions(select, "few");
    await vi.waitFor(() => expect(api.puts).toHaveLength(2));
    expect(api.puts[1]).toMatchObject({ style: "few" });
    await api.answerNext();
    await vi.waitFor(() => expect(select.value).toBe("few"));
    await renderingUpdate();
    expect(document.activeElement).toBe(select);
  });
});
