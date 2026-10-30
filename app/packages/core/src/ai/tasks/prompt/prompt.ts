// The ready-made prompt of a task (US-KI-08): the keeper sees the text before copying and adds nothing. It carries no
// credentials and no data the client could not fetch with its own rights anyway.
import { PROMPT_LABELS as L, TASK_INSTRUCTIONS, TASK_TITLES } from "./texts";
import { TASK_DRAFT_TYPE, type TaskType } from "../model";

export interface PromptTask {
  readonly id: string;
  readonly type: TaskType;
  readonly reference: string;
  readonly label: string;
}

/** `base` is the address the interface's routes hang under (for example `https://app.example` or `https://app.example/api`). */
export function taskPrompt(task: PromptTask, base: string): string {
  const at = (path: string) => `${base}${path}`;
  const task_ = `{"taskId": "${task.id}"}`;
  // Each operation names the MCP tool (E-04) and, for clients without MCP, the route of the interface.
  const operations = [
    `- ${L.claim}: claim_task ${task_} · POST ${at(`/mcp/tasks/${task.id}/claim`)}`,
    ...(task.type === "photo_assessment"
      ? [
          `- ${L.readPhoto}: get_measurement_photo {"measurementId": "${task.reference}"} · GET ${at(`/mcp/measurements/${task.reference}/photo`)}`,
        ]
      : []),
    `- ${L.deliver}: propose_draft {"type": "${TASK_DRAFT_TYPE[task.type]}", "taskId": "${task.id}", "source": ..., "content": ...} · POST ${at("/mcp/drafts")}`,
    `- ${L.decline}: decline_task ${task_} · POST ${at(`/mcp/tasks/${task.id}/decline`)}`,
  ];
  return [
    `${L.heading}`,
    `${L.id}: ${task.id}`,
    `${L.type}: ${TASK_TITLES[task.type]}`,
    `${L.reference}: ${JSON.stringify(task.label)}`,
    `${L.instruction}: ${TASK_INSTRUCTIONS[task.type]}`,
    `${L.operations}:`,
    ...operations,
    L.note,
  ].join("\n");
}
