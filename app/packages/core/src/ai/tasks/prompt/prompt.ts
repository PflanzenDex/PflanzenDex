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

/** `base` is the origin of the AI interface (for example `https://app.example`). */
export function taskPrompt(task: PromptTask, base: string): string {
  const at = (path: string) => `${base}${path}`;
  const operations = [
    `- ${L.claim}: POST ${at(`/mcp/tasks/${task.id}/claim`)}`,
    ...(task.type === "photo_assessment"
      ? [`- ${L.readPhoto}: GET ${at(`/mcp/measurements/${task.reference}/photo`)}`]
      : []),
    `- ${L.deliver}: POST ${at("/mcp/drafts")} mit {"type": "${TASK_DRAFT_TYPE[task.type]}", "taskId": "${task.id}", "source": ..., "content": ...}`,
    `- ${L.decline}: POST ${at(`/mcp/tasks/${task.id}/decline`)}`,
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
