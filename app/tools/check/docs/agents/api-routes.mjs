// Prints the routes of the API as a JSON array of `METHOD /path` (US-QG-10). Runs under `node --import tsx` because it
// imports the TypeScript app; check-reference.mjs starts it as a child process. The app is built with every optional
// part switched on (media, AI access, wish images) and a pool that refuses every query: building routes runs none.
import { createApp } from "../../../../packages/api/src/app.ts";

const refuse = async () => {
  throw new Error("reference-check: no database while listing routes");
};
const pool = { query: refuse, connect: refuse, on: () => pool };
const verifier = {
  verify: async () => {
    throw new Error("reference-check: no sign-in while listing routes");
  },
};
const app = createApp({
  pool,
  reviewer: verifier,
  media: { store: {}, processor: {} },
  ai: { verifier, resource: "https://reference.invalid/mcp", issuer: "https://reference.invalid" },
  wishImage: { sources: [] },
});
const routes = new Set(
  app.routes.filter((r) => r.method !== "ALL").map((r) => `${r.method} ${r.path}`),
);
process.stdout.write(JSON.stringify([...routes]));
