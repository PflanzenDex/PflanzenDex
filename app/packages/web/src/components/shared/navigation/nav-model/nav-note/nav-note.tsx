/**
 * The text mark of a destination that is not open yet (US-ONB-05): plain words ("Bald", "Noch gesperrt"), small, no
 * colour alarm and no motion (FR-ONB-08). The accessible name of the link becomes "Freunde, Noch gesperrt"; the label
 * itself stays as it is (US-QS-09).
 */
export function NavNote(props: { text: string | undefined; inline?: boolean }) {
  if (!props.text) return null;
  return props.inline ? (
    <span className="ml-auto rounded-control border border-border px-1.5 text-xs font-normal">
      <span className="sr-only">, </span>
      {props.text}
    </span>
  ) : (
    <span className="max-w-full break-words text-xs font-normal leading-tight">
      <span className="sr-only">, </span>
      {props.text}
    </span>
  );
}
