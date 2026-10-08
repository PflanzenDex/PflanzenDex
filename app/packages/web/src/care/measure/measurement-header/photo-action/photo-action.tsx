import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { errorText } from "@/lib/error-text";
import type { ApiError } from "../../../../kernel";
import type { PhotoAccess } from "@/lib/use-stored-photo";
import { RefusalAlert } from "../../../shared/notices/notices";
import { photoProblem, uploadPhoto } from "../measurement-photo";
import { MEDIA_LIMITS } from "@pflanzendex/core";

type Upload = ReturnType<typeof usePhotoUpload>;

/** State of choosing and sending the photo; the first try never replaces (the server says `photo_exists`). */
function usePhotoUpload(props: {
  access: PhotoAccess;
  specimenId: string;
  date: string;
  onSaved: () => void;
}) {
  const { access, specimenId, date, onSaved } = props;
  const [problem, setProblem] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<ApiError | null>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const send = async (file: File, replace: boolean) => {
    const token = await access.token();
    if (!token) return;
    const r = await uploadPhoto({ api: access.api, token }, specimenId, { file, date, replace });
    setInputKey((k) => k + 1);
    if (r.ok) {
      setPending(null);
      setRefusal(null);
      return onSaved();
    }
    if (r.error.code === "measurement.photo_exists" && !replace) return setPending(file);
    setPending(null);
    setRefusal(r.error);
  };
  const pick = (file: File | undefined) => {
    setRefusal(null);
    const found = file ? photoProblem(file) : null;
    setProblem(found);
    if (file && !found) void send(file, false);
  };
  return { problem, refusal, pending, setPending, inputKey, send, pick };
}

function ConfirmReplace({ up }: { up: Upload }) {
  const { pending, setPending, send } = up;
  // Mounted only while a confirmation is pending: the modal needs the viewport, the plain list does not.
  if (pending === null) return null;
  return (
    <ResponsiveModal
      title="Foto ersetzen?"
      closeLabel="Schließen"
      open
      onOpenChange={(open) => !open && setPending(null)}
    >
      <p>{errorText("measurement.photo_exists")}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="touch" onClick={() => pending && void send(pending, true)}>
          Foto ersetzen
        </Button>
        <Button type="button" variant="secondary" size="touch" onClick={() => setPending(null)}>
          Abbrechen
        </Button>
      </div>
    </ResponsiveModal>
  );
}

/**
 * Adds or replaces the photo of an existing measurement (US-WAC-05, US-WAC-06). If the measurement already has a
 * photo the keeper confirms before the old one goes (nothing disappears silently, P-10).
 */
export function PhotoAction(props: {
  access: PhotoAccess;
  specimenId: string;
  date: string;
  hasPhoto: boolean;
  onSaved: () => void;
}) {
  const up = usePhotoUpload(props);
  const id = `photo-action-${props.date}`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{props.hasPhoto ? "Foto ersetzen" : "Foto hinzufügen"}</Label>
      <Input
        key={up.inputKey}
        id={id}
        type="file"
        accept={MEDIA_LIMITS.uploadTypes.join(",")}
        onChange={(e) => up.pick(e.target.files?.[0])}
      />
      {up.problem && (
        <p role="alert" className="text-sm text-destructive">
          {up.problem}
        </p>
      )}
      {up.refusal && <RefusalAlert error={up.refusal} />}
      <ConfirmReplace up={up} />
    </div>
  );
}
