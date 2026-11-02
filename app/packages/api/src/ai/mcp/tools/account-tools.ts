// Tools over the connection, the daily status, the tasks and the drafts of the AI interface (US-KI-02, -07, -08, -09).
import { ID, object, query, seg, str, TIME_ZONE, type McpTool } from "./schema";

export const ACCOUNT_TOOLS: readonly McpTool[] = [
  {
    name: "get_session",
    title: "Connection",
    description:
      "Who you are connected as: the client name and the effective right (read, drafts or write) the keeper allows.",
    operation: "session",
    inputSchema: object({}),
    readOnly: true,
    request: () => ({ method: "GET", path: "/mcp/session" }),
  },
  {
    name: "get_status",
    title: "Daily status",
    description:
      "What is due today for the keeper's plants, prioritized, from the same function as the app's 'Today' view. " +
      "Phrase it, do not add or drop items; every item says what to do.",
    operation: "status",
    inputSchema: object({ timeZone: TIME_ZONE }),
    readOnly: true,
    request: (a) => ({ method: "GET", path: query("/mcp/status", a, ["timeZone"]) }),
  },
  {
    name: "list_tasks",
    title: "Open tasks",
    description:
      "Tasks the keeper placed in the app for you (species profile, wish candidates, photo assessment), with an " +
      "instruction each. Deliver the result with propose_draft and the taskId.",
    operation: "list_tasks",
    inputSchema: object({}),
    readOnly: true,
    request: () => ({ method: "GET", path: "/mcp/tasks" }),
  },
  {
    name: "claim_task",
    title: "Take over a task",
    description: "Marks an open task as in progress by you before you work on it.",
    operation: "claim_task",
    inputSchema: object({ taskId: ID("task") }, ["taskId"]),
    readOnly: false,
    request: (a) => ({ method: "POST", path: `/mcp/tasks/${seg(a["taskId"])}/claim` }),
  },
  {
    name: "decline_task",
    title: "Decline a task",
    description: "Declines a task you cannot do; the keeper sees it as declined.",
    operation: "decline_task",
    inputSchema: object({ taskId: ID("task") }, ["taskId"]),
    readOnly: false,
    request: (a) => ({ method: "POST", path: `/mcp/tasks/${seg(a["taskId"])}/decline` }),
  },
  {
    name: "list_draft_types",
    title: "Draft types",
    description: "The kinds of draft propose_draft accepts (e.g. species, photo_assessment, wish).",
    operation: "draft_types",
    inputSchema: object({}),
    readOnly: true,
    request: () => ({ method: "GET", path: "/mcp/draft-types" }),
  },
  {
    name: "propose_draft",
    title: "Deliver a draft",
    description:
      "Delivers a content result (species profile, photo assessment, wish candidate, ...) as a draft. Nothing counts " +
      "until the keeper adopts it in the app. The content must pass the schema of the target form; a source is " +
      "mandatory. Pass taskId when the draft answers a task.",
    operation: "propose_draft",
    inputSchema: object(
      {
        type: str("Draft type, one of list_draft_types.", { minLength: 1, maxLength: 50 }),
        reference: {
          type: ["string", "null"],
          description: "What the draft refers to (e.g. species name or measurement id).",
          maxLength: 200,
        },
        source: str("Where the content comes from (URL or citation).", {
          minLength: 1,
          maxLength: 1000,
        }),
        taskId: {
          type: ["string", "null"],
          description: "Id of the task this draft answers.",
          format: "uuid",
        },
        content: {
          type: "object",
          description: "The fields of the target form for this draft type.",
        },
      },
      ["type", "source", "content"],
    ),
    readOnly: false,
    request: (a) => ({
      method: "POST",
      path: "/mcp/drafts",
      body: { reference: null, taskId: null, ...a },
    }),
  },
];
