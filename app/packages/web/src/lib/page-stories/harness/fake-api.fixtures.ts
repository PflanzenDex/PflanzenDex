// A fake API for the page stories (US-QS-14): answers `fetch` from a table of paths, so the real screens render with
// fixture data and no network. A path that is not in the table answers 404, so the screen shows its error state.
export const API = "http://fixtures.invalid";

export type Routes = Record<string, unknown>;

const reply = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );

/** `fetch` for the story: GET and every write answer from the table by path (the query string is ignored). */
export function fakeFetch(routes: Routes): typeof fetch {
  return (input) => {
    const path = new URL(String(input)).pathname;
    return path in routes
      ? reply(200, routes[path])
      : reply(404, { error: { code: "server.not_found", text: "Nicht vorhanden." } });
  };
}

export const token = () => Promise.resolve("story-token");
