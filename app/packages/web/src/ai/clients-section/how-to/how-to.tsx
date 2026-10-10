import { Button } from "@/components/ui/button/button";
import { copyText } from "@/platform/clipboard";

/** How to connect an AI client: the address of the interface and the steps (US-KI-07). */
export function HowTo({ address }: { address: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <strong>So verbindest du einen KI-Client</strong>
      <ol className="m-0 flex list-decimal flex-col gap-1 pl-5">
        <li>
          Füge in deinem KI-Client einen eigenen Connector (MCP) mit dieser Adresse hinzu:{" "}
          <code className="break-all">{address}</code>
        </li>
        <li>Melde dich im Fenster des Anmeldedienstes an und bestätige die Anfrage.</li>
        <li>
          Der Client erscheint hier mit dem Recht „Entwürfe“. Höhere Rechte erlaubst du hier
          ausdrücklich.
        </li>
      </ol>
      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={() => void copyText(address)}
      >
        Adresse kopieren
      </Button>
    </div>
  );
}
