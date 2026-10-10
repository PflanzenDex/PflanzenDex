import {
  aiClaimTask,
  aiClientTasks,
  aiDeclineClientTask,
  taskPrompt,
  TASK_TITLES,
  type AiLogStore,
  type AiTask,
  type TaskStore,
} from "@pflanzendex/core";
import { Hono } from "hono";
import { errorBody, statusFor } from "../../kernel";
import { clientAuthentication, type AiEnv, type ClientGuardOptions } from "../client-auth";

/**
 * Task routes of the AI client (AI token, US-KI-08): `GET /mcp/tasks` lists the open tasks (read right),
 * `POST /mcp/tasks/:id/claim` takes one over and `POST /mcp/tasks/:id/decline` declines it (right "create drafts").
 * The result of a task is delivered as a draft with `taskId` (`POST /mcp/drafts`, US-KI-09).
 */
export function clientTaskRoutes(
  guard: ClientGuardOptions,
  stores: { tasks: TaskStore; log: AiLogStore },
  interfaceUrl: string,
  clock: () => Date,
): Hono<AiEnv> {
  const base = new URL(interfaceUrl).origin;
  const view = (t: AiTask) => ({ ...t, title: TASK_TITLES[t.type], prompt: taskPrompt(t, base) });
  const client = new Hono<AiEnv>();
  client.get("/mcp/tasks", clientAuthentication(guard, "read"), async (c) => {
    const { connection, rights } = c.get("ai");
    const r = await aiClientTasks(stores, {
      userId: c.get("account").id,
      connectionId: connection.id,
      rights,
      now: clock(),
    });
    return r.ok
      ? c.json({ ...r.value, tasks: r.value.tasks.map(view) })
      : c.json(errorBody(r.error), statusFor(r.error));
  });
  for (const [path, op] of [
    ["claim", aiClaimTask],
    ["decline", aiDeclineClientTask],
  ] as const)
    client.post(`/mcp/tasks/:id/${path}`, clientAuthentication(guard, "drafts"), async (c) => {
      const { connection, rights } = c.get("ai");
      const r = await op(stores, {
        userId: c.get("account").id,
        connectionId: connection.id,
        rights,
        id: c.req.param("id"),
        now: clock(),
      });
      return r.ok ? c.json(view(r.value)) : c.json(errorBody(r.error), statusFor(r.error));
    });
  return client;
}
