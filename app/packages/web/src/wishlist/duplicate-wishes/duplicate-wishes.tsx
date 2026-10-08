import { useId, useState } from "react";
import { WISH_LIMITS, type CandidateList, type DuplicateWish } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { Input } from "@/components/ui/fields/input/input";
import { Label } from "@/components/ui/display/label/label";
import { useWriteAction, type Response } from "../../kernel";
import { removeDuplicateWish, renameWish } from "../wishlist-api";

type Token = () => Promise<string | undefined>;
type Hint = { text: string; nextAction: string };

/** Rename and delete of the duplicates (FR-WUN-06, issue 303): the answer says what happened and what comes next (P-09, P-10). */
export function useRepair(api: string, token: Token, onWritten: () => void, onRun: () => void) {
  const write = useWriteAction(token, onWritten);
  const [done, setDone] = useState<Hint | null>(null);
  const finish = (r: Response<{ hint: Hint }>) => {
    setDone(r.ok ? r.value.hint : null);
    return r;
  };
  return {
    rename: (w: DuplicateWish, name: string) => {
      onRun();
      void write.run(async (t) => finish(await renameWish(api, t, { wishId: w.id, name })), "");
    },
    remove: (w: DuplicateWish) => {
      onRun();
      void write.run(async (t) => finish(await removeDuplicateWish(api, t, w.id)), "");
    },
    done,
    running: write.running,
    error: write.error,
  };
}

type Repair = ReturnType<typeof useRepair>;

/** One duplicate: a field for the new name, "Umbenennen", and "Löschen" that asks before it deletes (P-10). */
function DuplicateRow({ w, repair }: { w: DuplicateWish; repair: Repair }) {
  const field = useId();
  const [name, setName] = useState(w.name);
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const send = () => {
    if (name.trim() === "") return setProblem("Bitte gib einen Namen an.");
    setProblem(null);
    repair.rename(w, name.trim());
  };
  return (
    <li className="grid min-w-0 gap-2 break-words rounded-lg border border-border p-3">
      <p className="font-semibold">{w.title}</p>
      <div className="grid gap-1">
        <Label htmlFor={field}>Neuer Name für {w.title}</Label>
        <Input
          id={field}
          value={name}
          maxLength={WISH_LIMITS.name.max}
          autoComplete="off"
          invalid={problem !== null}
          onChange={(e) => setName(e.target.value)}
        />
        {problem && (
          <p role="alert" className="text-destructive">
            {problem}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="touch"
          disabled={repair.running}
          aria-label={`Umbenennen: ${w.title}`}
          onClick={send}
        >
          Umbenennen
        </Button>
        {asking ? (
          <Confirm w={w} repair={repair} onCancel={() => setAsking(false)} />
        ) : (
          <Button
            type="button"
            variant="outline"
            size="touch"
            disabled={repair.running}
            aria-label={`Löschen: ${w.title}`}
            onClick={() => setAsking(true)}
          >
            Löschen
          </Button>
        )}
      </div>
    </li>
  );
}

function Confirm(props: { w: DuplicateWish; repair: Repair; onCancel: () => void }) {
  const { w, repair } = props;
  return (
    <div className="grid gap-2">
      <p>Wirklich löschen? Der andere Wunsch mit diesem Namen bleibt erhalten.</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="destructive"
          size="touch"
          disabled={repair.running}
          aria-label={`Ja, löschen: ${w.title}`}
          onClick={() => repair.remove(w)}
        >
          Ja, löschen
        </Button>
        <Button type="button" variant="outline" size="touch" onClick={props.onCancel}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}

/**
 * Open wishes that share a name with another wish after folding (migration 0020, FR-WUN-06, issue 303): the hint says what
 * is wrong and what to do (P-09), each wish can be renamed or deleted. Without such wishes the section does not exist.
 */
export function DuplicateWishes({ list, repair }: { list: CandidateList; repair: Repair }) {
  if (!list.duplicateHint || list.duplicates.length === 0) return null;
  return (
    <section
      aria-labelledby="duplicates-title"
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-primary p-3"
    >
      <h2 id="duplicates-title" className="text-xl font-semibold">
        Doppelte Namen
      </h2>
      <p>{list.duplicateHint.text}</p>
      <p className="font-semibold">{list.duplicateHint.nextAction}</p>
      <ul
        className="m-0 grid list-none grid-cols-1 gap-2 p-0"
        aria-label="Wünsche mit doppeltem Namen"
      >
        {list.duplicates.map((w) => (
          <DuplicateRow key={w.id} w={w} repair={repair} />
        ))}
      </ul>
    </section>
  );
}
