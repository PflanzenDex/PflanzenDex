import { serve } from "@hono/node-server";
import { createApp } from "./app";

const port = Number(process.env["PORT"] ?? 3000);
const version = process.env["GIT_SHA"];
serve({ fetch: createApp({ version }).fetch, port }, (info) => {
  console.log(`API läuft auf http://localhost:${info.port}`);
});
