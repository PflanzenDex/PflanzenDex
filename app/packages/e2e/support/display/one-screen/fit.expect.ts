import type { BrowserContext, Page } from "@playwright/test";
import type { Expect, Screen } from "./register";

// The precondition of a register entry and its failing request (US-QS-15, QG-U8; issue 2431). A state is only measured when its
// seed data is there: the precondition is checked first, and a miss is a seed gap, named as such and never baselined (#2350,
// #2427). The error state refuses the GET of one path, so the list shows its failure and its retry.

const named = (e: Expect) =>
  e.text !== undefined ? `the text "${e.text}"` : `the selector ${e.css}`;

/** How many matches of the precondition are rendered (a text or a selector) on the open page. */
function shownOf(page: Page, e: Expect): Promise<number> {
  const locator = e.text !== undefined ? page.getByText(e.text) : page.locator(e.css ?? "");
  return locator.evaluateAll((els) => els.filter((el) => el.getClientRects().length > 0).length);
}

/** Throws "seed gap: <screen>: …" when the precondition of the screen is not on the page (issue 2431). Nothing when it has none. */
export async function checkExpect(page: Page, screen: Screen): Promise<void> {
  const e = screen.expect;
  if (!e) return;
  const shown = await shownOf(page, e);
  if (e.absent) {
    if (shown > 0)
      throw new Error(
        `seed gap: ${screen.id}: ${named(e)} is shown, but the state needs it absent (the empty state is not in the seed)`,
      );
    return;
  }
  const needed = e.count ?? 1;
  if (shown < needed)
    throw new Error(
      `seed gap: ${screen.id}: ${named(e)} is missing (${shown} of ${needed} shown; the state is not in the seed)`,
    );
}

/** Refuses the GET of the screen's `fail` path on the API, so the page shows its error state (issue 2431). Other requests pass. */
export async function applyFail(
  context: BrowserContext,
  screen: Screen,
  api: string,
): Promise<void> {
  if (!screen.fail) return;
  const origin = new URL(api).origin;
  const path = screen.fail;
  // Registered after the API route of the spec, so it is checked first (the last route that matches wins).
  await context.route(
    (url) => url.origin === origin && url.pathname === path,
    (route) => (route.request().method() === "GET" ? route.abort() : route.continue()),
  );
}

/** The API path of a request matches the pattern of a reply: the same segments, `*` for any one segment. */
const matchesPath = (pattern: string, path: string): boolean => {
  const want = pattern.split("/");
  const have = path.split("/");
  return want.length === have.length && want.every((s, i) => s === "*" || s === have[i]);
};

/**
 * Answers the one write of the screen's `reply` itself (issue 2622): the gate aborts every write, so a state that only a refused
 * write shows could not be reached by its click. The request gets the status and body of the reply, with the headers that the
 * browser needs for a request to another origin, and never reaches the API. Other requests pass to the routes before it.
 */
export async function applyReply(
  context: BrowserContext,
  screen: Screen,
  api: string,
): Promise<void> {
  const reply = screen.reply;
  if (!reply) return;
  const origin = new URL(api).origin;
  // Registered after the API route of the spec, so it is checked first (the last route that matches wins).
  await context.route(
    (url) => url.origin === origin && matchesPath(reply.path, url.pathname),
    (route) => {
      const request = route.request();
      const headers = {
        "access-control-allow-origin": request.headers()["origin"] ?? "*",
        "access-control-allow-headers": "authorization, content-type, idempotency-key",
        "access-control-allow-methods": reply.method,
      };
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (request.method() !== reply.method) return route.fallback();
      return route.fulfill({
        status: reply.status,
        contentType: "application/json",
        headers,
        body: JSON.stringify(reply.body),
      });
    },
  );
}
