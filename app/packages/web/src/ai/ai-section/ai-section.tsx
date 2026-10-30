import { LayerPart } from "@/components/shared/responsive/layer-sheet/layer-part/layer-part";
import { AiClientsSection } from "../clients-section/clients-section";
import { HowTo } from "../clients-section/how-to/how-to";
import { LogSection } from "../log-section/log-section";
import { NewTaskPart, TasksSection } from "../tasks-section/tasks-section";
import { DraftsSection } from "../drafts-section/drafts-section";

type Token = () => Promise<string | undefined>;

/**
 * The AI part of "Konto" (US-QS-17): six rows, each opens its layer (US-QS-15). How to connect a client (US-KI-07), the
 * connected clients (US-KI-07), a new task (US-KI-08), the tasks (US-KI-08), the inbox of drafts (US-KI-09) and the log
 * (US-KI-10). A closed layer loads nothing; every part loads and fails on its own (P-10).
 */
export function AiSection(props: { api: string; token: Token }) {
  return (
    <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
      <LayerPart
        id="howto"
        title="So verbindest du einen KI-Client"
        value="Adresse und drei Schritte"
      >
        <HowTo address={`${props.api.replace(/\/$/, "")}/mcp`} />
      </LayerPart>
      <LayerPart
        id="clients"
        title="Verbundene KI-Clients"
        value="Rechte, trennen, wieder zulassen"
      >
        <AiClientsSection {...props} />
      </LayerPart>
      <LayerPart id="new-task" title="Neuer Auftrag" value="Text für deinen KI-Client">
        <NewTaskPart {...props} />
      </LayerPart>
      <LayerPart id="tasks" title="Aufträge" value="Status und Text der Aufträge">
        <TasksSection {...props} />
      </LayerPart>
      <LayerPart id="drafts" title="Entwürfe" value="Ergebnisse prüfen und übernehmen">
        <DraftsSection {...props} />
      </LayerPart>
      <LayerPart id="log" title="Protokoll" value="Was dein KI-Client getan hat">
        <LogSection {...props} />
      </LayerPart>
    </div>
  );
}
