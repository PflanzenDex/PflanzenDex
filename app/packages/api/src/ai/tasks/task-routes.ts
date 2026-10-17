import {
  aiCancelTask,
  aiCreateTask,
  aiTaskPreview,
  aiTasks,
  taskPrompt,
  TASK_TITLES,
  type AiTask,
  type ConnectionStore,
  type TaskStore,
} from "@pflanzendex/core";
import { IdempotencyPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { body, write, type AuthEnv } from "../../kernel";

/**
 * The keeper's side of tasks to the AI client (US-KI-08); the sign-in guard of the web app is applied by the caller.
 * `GET /ai/tasks` lists the tasks with their status and, for open ones, the ready-made prompt ("Open in AI client"),
 * and says whether a client is connected; `POST /ai/tasks` creates a task (merged with an open one of the same type and
 * reference; without a connected client it is refused with `ai.no_client`); `POST /ai/tasks/preview` returns the text
 * of a task without storing anything ("Copy task as text"); `POST /ai/tasks/:id/cancel` withdraws a task.
 */
export function taskRoutes(
  pool: Pool,
  stores: { tasks: TaskStore; connections: ConnectionStore },
  interfaceUrl: string,
  clock: () => Date,
): Hono<AuthEnv> {
  const base = new URL(interfaceUrl).origin;
  const deps = stores;
  const writes = { idempotency: new IdempotencyPostgres(pool) };
  const withPrompt = (t: AiTask) => ({
    ...t,
    title: TASK_TITLES[t.type],
    prompt: t.status === "open" || t.status === "in_progress" ? taskPrompt(t, base) : null,
  });
  const routes = new Hono<AuthEnv>();
  routes.get("/ai/tasks", async (c) => {
    const r = await aiTasks(deps, c.get("account").id, clock());
    return c.json({ clientConnected: r.clientConnected, tasks: r.tasks.map(withPrompt) });
  });
  routes.post("/ai/tasks/preview", async (c) =>
    write(c, writes, aiTaskPreview, {
      input: await body(c),
      wrapper: (v) => ({
        ...v,
        title: TASK_TITLES[v.type],
        prompt: taskPrompt({ id: "<wird beim Anlegen vergeben>", ...v }, base),
      }),
    }),
  );
  routes.post("/ai/tasks", async (c) =>
    write(c, writes, aiCreateTask(deps, clock), {
      input: await body(c),
      wrapper: (v) => ({ created: v.created, task: withPrompt(v.task) }),
    }),
  );
  routes.post("/ai/tasks/:id/cancel", async (c) =>
    write(c, writes, aiCancelTask(deps, clock), {
      input: { id: c.req.param("id") },
      wrapper: withPrompt,
    }),
  );
  return routes;
}
