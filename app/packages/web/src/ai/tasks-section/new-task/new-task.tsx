import { useState } from "react";
import { Button } from "@/components/ui/button/button";
import { Input } from "@/components/ui/fields/input/input";
import { Select } from "@/components/ui/fields/select/select";
import { copyText } from "@/platform/clipboard";
import { useWriteAction } from "../../../kernel";
import { createTask, previewTask, type AiTaskType } from "../../api/connections-api";

type Token = () => Promise<string | undefined>;

const TYPES: Record<AiTaskType, { title: string; field: string }> = {
  species_profile: { title: "Artprofil recherchieren", field: "Name der Art" },
  wish_candidates: { title: "Wunschkandidaten suchen", field: "Lichtzone" },
  photo_assessment: { title: "Foto beurteilen", field: "Kennung der Messung" },
};

function Fields(props: {
  type: AiTaskType;
  reference: string;
  onType: (type: AiTaskType) => void;
  onReference: (reference: string) => void;
}) {
  return (
    <>
      <label className="flex flex-col gap-1">
        Auftrag
        <Select value={props.type} onChange={(e) => props.onType(e.target.value as AiTaskType)}>
          {Object.entries(TYPES).map(([value, t]) => (
            <option key={value} value={value}>
              {t.title}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1">
        {TYPES[props.type].field}
        {props.type === "wish_candidates" ? (
          <Select
            value={props.reference || "2"}
            onChange={(e) => props.onReference(e.target.value)}
          >
            {["2", "3", "4"].map((z) => (
              <option key={z} value={z}>{`Lichtzone ${z}`}</option>
            ))}
          </Select>
        ) : (
          <Input value={props.reference} onChange={(e) => props.onReference(e.target.value)} />
        )}
      </label>
    </>
  );
}

function TextBox(props: { text: string; onCopy: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      <pre className="m-0 whitespace-pre-wrap break-words rounded-lg border border-border p-3 text-sm">
        {props.text}
      </pre>
      <div>
        <Button type="button" size="sm" onClick={props.onCopy}>
          Auftrag als Text kopieren
        </Button>
      </div>
    </div>
  );
}

function NoClient() {
  return (
    <p className="m-0 rounded-lg border border-border p-3">
      Es ist kein KI-Client verbunden, darum kannst du keinen Auftrag anlegen. Verbinde einen
      KI-Client oder kopiere den Auftrag als Text und füge ihn selbst in deinen Client ein.
    </p>
  );
}

function Messages(props: { error: string | null; status: string | null }) {
  return (
    <>
      {props.error && (
        <p role="alert" className="m-0 rounded-lg border border-destructive p-3">
          {props.error}
        </p>
      )}
      {props.status && (
        <p role="status" className="m-0 rounded-lg border border-border p-3">
          {props.status}
        </p>
      )}
    </>
  );
}

/** The form for a new task, with the text of the task shown and copyable without a connected client (US-KI-08). */
export function NewTask(props: {
  api: string;
  token: Token;
  connected: boolean;
  onCreated: () => void;
}) {
  const [type, setType] = useState<AiTaskType>("species_profile");
  const [reference, setReference] = useState("");
  const [text, setText] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const write = useWriteAction(props.token, props.onCreated);

  const preview = async () => {
    const t = await props.token();
    const r = t ? await previewTask(props.api, t, type, reference) : null;
    setNotice(null);
    setProblem(r && !r.ok ? r.error.text : null);
    setText(r?.ok ? r.value.prompt : null);
  };
  const copy = async (value: string) => {
    setNotice((await copyText(value)) ? "Der Text liegt in der Zwischenablage." : null);
    setProblem(null);
  };
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <strong>Neuen Auftrag anlegen</strong>
      <Fields
        type={type}
        reference={reference}
        onType={(next) => {
          setType(next);
          setReference(next === "wish_candidates" ? "2" : "");
          setText(null);
        }}
        onReference={setReference}
      />
      {!props.connected && <NoClient />}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={!props.connected || write.running}
          onClick={() =>
            void write.run(
              (t) => createTask(props.api, t, type, reference),
              "Der Auftrag ist angelegt.",
            )
          }
        >
          Auftrag anlegen
        </Button>
        <Button type="button" variant="outline" onClick={() => void preview()}>
          Auftrag als Text anzeigen
        </Button>
      </div>
      {text && <TextBox text={text} onCopy={() => void copy(text)} />}
      <Messages error={write.error?.text ?? problem} status={write.message ?? notice} />
    </div>
  );
}
