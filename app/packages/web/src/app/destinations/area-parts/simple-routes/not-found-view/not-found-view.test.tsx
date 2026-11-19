// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { RouteFocus } from "@/shared/platform/routing/route-focus/route-focus";
import { viewTitle } from "@/shared/patterns/navigation/navigation/navigation";
import { NotFoundView } from "./not-found-view";

afterEach(() => {
  cleanup();
  document.title = "";
});

function Address() {
  const at = useLocation();
  return <p data-testid="address">{at.pathname}</p>;
}

/** The app's route table in miniature: "Heute" and the splat route, with the focus and title handling of the shell. */
function shown(address: string, withShell = false) {
  return render(
    <MemoryRouter initialEntries={[address]}>
      {withShell ? <RouteFocus titleOf={viewTitle} /> : null}
      <Routes>
        <Route path="/today" element={<h1>Heute</h1>} />
        <Route path="*" element={<NotFoundView />} />
      </Routes>
      <Address />
    </MemoryRouter>,
  );
}

describe("US-QS-32 an unknown address shows the not-found view inside the frame", () => {
  it("US-QS-32 the view has its own mark and the title as its one h1, with no error role and no empty mark", () => {
    const { container } = shown("/gibt-es-nicht");
    expect(
      screen.getByRole("heading", { level: 1, name: "Diese Seite gibt es nicht" }),
    ).toBeTruthy();
    expect(container.querySelector("svg.lucide-file-question")).not.toBeNull();
    expect(container.querySelector("svg.lucide-sprout")).toBeNull();
    expect(container.querySelector("svg.lucide-circle-alert")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("US-QS-32 it offers one action, Zu Heute, and nothing else", () => {
    shown("/gibt-es-nicht");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Zu Heute" })).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("US-QS-32 Zu Heute leads to Heute and does not keep the unknown address", async () => {
    shown("/gibt-es-nicht");
    await userEvent.click(screen.getByRole("button", { name: "Zu Heute" }));
    expect(await screen.findByRole("heading", { name: "Heute" })).toBeTruthy();
    expect(screen.getByTestId("address").textContent).toBe("/today");
  });

  it("US-QS-09 the document title names the not-found page while it shows, and Heute gets its own title back", async () => {
    shown("/gibt-es-nicht", true);
    await waitFor(() => expect(document.title).toBe("Seite nicht gefunden – PflanzenDéx"));
    await userEvent.click(screen.getByRole("button", { name: "Zu Heute" }));
    await screen.findByRole("heading", { name: "Heute" });
    await waitFor(() => expect(document.title).toBe("Heute – PflanzenDéx"));
  });
});
