import { AiClientsSection } from "../clients-section/clients-section";
import { TasksSection } from "../tasks-section/tasks-section";
import { DraftsSection } from "../drafts-section/drafts-section";

type Token = () => Promise<string | undefined>;

/** The AI part of "Konto": the connected clients (US-KI-07), the tasks to them (US-KI-08) and the inbox of their drafts (US-KI-09). */
export function AiSection(props: { api: string; token: Token }) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <AiClientsSection {...props} />
      <div className="flex flex-col gap-3">
        <h3 className="m-0 text-lg font-semibold">Aufträge</h3>
        <TasksSection {...props} />
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="m-0 text-lg font-semibold">Entwürfe</h3>
        <DraftsSection {...props} />
      </div>
    </div>
  );
}
